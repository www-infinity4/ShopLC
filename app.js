(function(){
  "use strict";

  const $=id=>document.getElementById(id);
  const LEDGER_ENDPOINT="https://starquest-ledger.marvaseater.workers.dev";
  const DEVICE_PREFIX="starquest_ledger_device_v1:";
  const STREAMS=[
    "https://cdn-shop-lc-01.vos360.video/Content/HLS_HLS/Live/channel%28ShopLCStirrTV%29/master.m3u8",
    "https://cdn-shop-lc-01.akamaized.net/Content/HLS_HLS/Live/channel%28ott%29/master.m3u8",
    "https://cdn-shop-lc-01.akamaized.net/Content/HLS_HLS/Live/channel%28xumo%29/index.m3u8"
  ];

  let streamIndex=0,hls=null,started=false,recoveries=0,failedFeeds=0;
  const player=$("player"),clock=$("stationClock"),soundButton=$("soundButton"),shareButton=$("shareButton"),shareStatus=$("shareStatus"),modeLabel=$("modeLabel");
  const rewardStatus=$("rewardStatus"),rewardAuctionGrid=$("rewardAuctionGrid");
  const shopBrowser=$("shopBrowser"),shopSafeProduct=$("shopSafeProduct"),shopBrowserTitle=$("shopBrowserTitle"),shopBrowserClose=$("shopBrowserClose");

  function parse(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch(_){return fallback}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}}
  function uid(prefix){try{return prefix+"-"+crypto.randomUUID()}catch(_){return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)}}

  function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
  function safeHttp(value,fallback){try{const u=new URL(String(value||""),location.href);return /^https?:$/.test(u.protocol)?u.href:fallback}catch(_){return fallback}}

  function tokenFrom(raw){
    if(/^sq_[A-Za-z0-9_-]{32,}$/.test(String(raw||"")))return String(raw);
    try{
      const value=JSON.parse(String(raw||"null"));
      return /^sq_[A-Za-z0-9_-]{32,}$/.test(String(value&&value.deviceToken||""))?String(value.deviceToken):"";
    }catch(_){return ""}
  }

  function deviceToken(){
    const session=parse("starquest_session",null);
    const names=[session&&session.key,session&&session.username].filter(Boolean).map(value=>String(value).toLowerCase());
    for(const name of [...new Set(names)]){
      const token=tokenFrom(localStorage.getItem(DEVICE_PREFIX+name));
      if(token)return token;
    }
    const found=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||"";
      if(!key.startsWith(DEVICE_PREFIX))continue;
      const token=tokenFrom(localStorage.getItem(key));
      if(token&&!found.includes(token))found.push(token);
    }
    return found.length===1?found[0]:"";
  }

  function activeQuantId(){
    const items=parse("quantaPhiBuildHistoryV1",[]);
    if(!Array.isArray(items)||!items.length)return "";
    const sorted=items.slice().sort((a,b)=>Date.parse(b&&((b.created_at||b.createdAt))||0)-Date.parse(a&&((a.created_at||a.createdAt))||0));
    const current=sorted[0]||{};
    return String(current.search_id||current.token_id||current.tokenId||current.id||"").slice(0,240);
  }

  function applyCloudStarState(state){
    if(!state||!Number.isFinite(Number(state.starCoins)))return;
    const session=parse("starquest_session",null);
    const users=parse("starquest_users",{});
    const key=session&&session.key;
    if(key&&users&&users[key]){
      const profile={...users[key]};
      profile.tokens=Number(state.starCoins)||0;
      profile.pendingShareCredits=Number(state.pendingShareCredits)||0;
      profile.shareCount=Number(state.shareCount)||0;
      users[key]=profile;
      write("starquest_users",users);
    }else{
      const guest=parse("starquest_guest_profile_v1",{key:"__guest__",username:"Guest",tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[]});
      guest.tokens=Number(state.starCoins)||0;
      guest.pendingShareCredits=Number(state.pendingShareCredits)||0;
      guest.shareCount=Number(state.shareCount)||0;
      write("starquest_guest_profile_v1",guest);
    }
    window.dispatchEvent(new CustomEvent("controlphi:wallet-change",{detail:{source:"shoplc-cloud",state}}));
  }

  function setRewardStatus(message,kind){
    if(!rewardStatus)return;
    rewardStatus.textContent=message||"";
    rewardStatus.dataset.kind=kind||"";
  }

  async function publicLedger(path){
    const response=await fetch(LEDGER_ENDPOINT+path,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.message||data.error||("http_"+response.status));
    return data;
  }

  async function currentLiveItem(){
    return publicLedger("/v1/shoplc/current-item");
  }

  async function storeShopLcClick(product,actionType){
    const token=deviceToken();
    if(!token)return null;
    const payload={
      clickId:uid("shoplc-signal"),
      itemId:String(product.itemId||""),
      href:String(product.href||"https://www.shoplc.com/"),
      title:String(product.title||""),
      category:String(product.category||""),
      gemstone:String(product.gemstone||""),
      ringSize:String(product.ringSize||""),
      metal:String(product.metal||""),
      style:String(product.style||""),
      price:Number(product.price)||0,
      image:String(product.image||""),
      actionType:String(actionType||"view"),
      quantId:activeQuantId()
    };
    const response=await fetch(LEDGER_ENDPOINT+"/v1/shoplc/clicks",{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      cache:"no-store"
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.message||data.error||("http_"+response.status));
    return data;
  }

  const REWARD_QUEUE="shoplc:pending-reward-receipts:v1";
  let rewardSyncing=false;
  async function rewardShopLcClick({actionType,itemId,href,clickId},retry=false){
    const intent={actionType,itemId,href,clickId:clickId||uid("shoplc-click"),quantId:activeQuantId()};
    if(!retry){const pending=parse(REWARD_QUEUE,[]);if(!pending.some(x=>x.itemId===itemId&&x.actionType===actionType)){if(!write(REWARD_QUEUE,[...pending,intent]))throw Error("Reward receipt could not be saved")}else Object.assign(intent,pending.find(x=>x.itemId===itemId&&x.actionType===actionType));}
    let token=deviceToken();
    if(!token&&window.QuantaCloudConnection?.resolveDeviceToken)token=await window.QuantaCloudConnection.resolveDeviceToken();
    if(!token){
      setRewardStatus("Shop LC opened, but this Star Coin wallet is not connected to the cloud ledger yet.","warn");
      return null;
    }
    setRewardStatus("Recording the item click and checking the 3-per-day limit...","pending");
    const response=await fetch(LEDGER_ENDPOINT+"/v1/shoplc/rewards",{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({
        ...intent
      }),
      cache:"no-store"
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok){
      setRewardStatus(data.message||"The Star Coin ledger did not accept this click.","error");
      return null;
    }
    write(REWARD_QUEUE,parse(REWARD_QUEUE,[]).filter(x=>x.clickId!==intent.clickId));
    applyCloudStarState(data.state);
    void window.ControlPhi?.refreshCloudWallet?.();
    if(data.credited){
      setRewardStatus("+5 Star Coins credited. "+data.remainingToday+" rewarded item"+(data.remainingToday===1?"":"s")+" left today.","ok");
    }else if(data.reason==="item_already_rewarded"){
      setRewardStatus("This Shop LC item already paid its one-time 5 Star Coin reward.","info");
    }else if(data.reason==="daily_limit"){
      setRewardStatus("Daily reward limit reached: 3 Shop LC items today.","info");
    }else{
      setRewardStatus("This click was already recorded; no duplicate Star Coins were added.","info");
    }
    return data;
  }

  async function flushRewardQueue(){
    if(rewardSyncing)return;rewardSyncing=true;
    try{for(const intent of parse(REWARD_QUEUE,[]).slice(0,20)){const result=await rewardShopLcClick(intent,true);if(!result)break}}catch(error){console.warn("ShopLC reward saved for retry",error)}finally{rewardSyncing=false}
  }
  for(const event of ["online","focus"])window.addEventListener(event,flushRewardQueue);
  document.addEventListener("starquest:ledger-connected",flushRewardQueue);
  setInterval(()=>{if(!document.hidden)void flushRewardQueue()},45000);
  void flushRewardQueue();

  function openSafeProduct(product,actionType){
    if(!shopBrowser||!shopSafeProduct)return;
    const isBuy=actionType==="buy";
    const isBid=actionType==="bid";
    const shopHref=isBuy
      ?"https://www.shoplc.com/pages/live-tv"
      :safeHttp(product.href,"https://www.shoplc.com/");
    const title=String(product.title||"Shop LC item").trim();
    const image=safeHttp(product.image,"");
    const price=Number(product.price)||0;
    const code=String(product.productCode||product.itemId||"").replace(/^[^:]+:/,"");
    const attrs=[
      ["Product",code],["Category",product.category],["Gemstone",product.gemstone],
      ["Ring size",product.ringSize],["Metal",product.metal],["Style",product.style]
    ].filter(([,value])=>String(value||"").trim());
    const terms=[product.gemstone,product.category,product.ringSize?("size "+product.ringSize):"",product.style,product.metal].filter(Boolean).join(" ");
    const ebayHref="https://www.ebay.com/sch/i.html?_nkw="+encodeURIComponent(terms||title);
    shopSafeProduct.innerHTML=
      '<article class="safe-card">'+
        '<div class="safe-media">'+(image?'<img src="'+esc(image)+'" alt="'+esc(title)+'">':'<div class="safe-fallback">Shop LC product</div>')+'</div>'+
        '<div class="safe-body">'+
          '<div class="safe-kicker">SHOPLC SAFE PRODUCT</div>'+
          '<h2 class="safe-title">'+esc(title)+'</h2>'+
          (price?'<div class="safe-price">$'+price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+'</div>':'')+
          '<div class="safe-chips">'+attrs.map(([label,value])=>'<span class="safe-chip">'+esc(label)+': '+esc(value)+'</span>').join("")+'</div>'+
          '<div class="safe-actions">'+
            '<a class="safe-shoplc" href="'+esc(shopHref)+'" target="_blank" rel="noopener noreferrer">'+(isBid?'Continue to Shop LC auction':'Continue to Shop LC live item')+'</a>'+
            '<a class="safe-ebay" href="'+esc(ebayHref)+'" target="_blank" rel="noopener noreferrer">Find similar on eBay</a>'+
          '</div>'+
          '<p class="safe-note">This product click was recorded before this card opened. '+(isBuy?'The Shop LC button opens the known-good live shopping page, where the current on-air item can be purchased.':'Shop LC handles the actual transaction.')+'</p>'+
          '<div class="safe-quant">'+(activeQuantId()?'Linked Quant: '+esc(activeQuantId()):'No active Quant ID was available for this click.')+'</div>'+
        '</div>'+
      '</article>';
    shopBrowser.hidden=false;
    if(shopBrowserTitle)shopBrowserTitle.textContent=title;
    shopBrowser.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function trackClick(link,extra={}){
    const events=parse("shoplc_click_events_v1",[]);
    const event={
      id:link.dataset.track||"link",
      href:link.href,
      at:Date.now(),
      quantId:activeQuantId(),
      actionType:extra.actionType||"",
      itemId:extra.itemId||"",
      rewardEligible:Boolean(extra.actionType&&extra.itemId),
      title:extra.title||"",
      gemstone:extra.gemstone||"",
      ringSize:extra.ringSize||""
    };
    events.push(event);
    try{localStorage.setItem("shoplc_click_events_v1",JSON.stringify(events.slice(-250)));}
    catch(error){console.warn("ShopLC local click history unavailable; cloud reward can continue",error);}
    window.dispatchEvent(new CustomEvent("controlphi:activity",{detail:{action:"shoplc-click",topic:event.itemId||event.id,quantId:event.quantId,page:location.pathname,at:new Date(event.at).toISOString(),source:"shoplc"}}));
  }

  async function handleShopLink(link){
    let href=link.href;
    const actionType=String(link.dataset.rewardAction||"").toLowerCase();
    let itemId=String(link.dataset.itemId||"");
    let product={
      itemId:itemId||("browse:"+String(link.dataset.track||"shoplc").replace(/[^a-z0-9_-]/gi,"-")),
      href,
      title:String(link.textContent||"Shop LC").replace(/\s+/g," ").trim().slice(0,500),
      category:String(link.dataset.track||"shopping").slice(0,80)
    };

    if(actionType==="buy"&&link.dataset.itemSource==="current-live"){
      try{
        const current=await currentLiveItem();
        product={...product,...current,href:String(current.href||href),itemId:String(current.itemId||product.itemId)};
      }catch(error){
        trackClick(link,{actionType:"browse",itemId:product.itemId,title:product.title});
        try{await storeShopLcClick(product,"browse")}catch(_){}
        openSafeProduct(product,"browse");
        setRewardStatus("The live product details could not be verified, so no Star Coins were issued for this click.","warn");
        return;
      }
    }else if(actionType==="bid"){
      const code=String(itemId||"").replace(/^auction:/,"");
      product={...product,title:"Shop LC auction "+code,category:"auction"};
    }

    trackClick(link,{actionType:actionType||"browse",itemId:product.itemId,title:product.title,gemstone:product.gemstone||"",ringSize:product.ringSize||""});
    try{
      await storeShopLcClick(product,actionType||"browse");
    }catch(error){
      console.warn("ShopLC cloud click storage:",error);
    }
    if(actionType&&product.itemId){
      try{await rewardShopLcClick({actionType,itemId:product.itemId,href:product.href});}
      catch(error){
        console.warn("ShopLC reward request deferred:",error);
        setRewardStatus("Shopping opened, but the cloud ledger could not confirm a Star Coin reward. The click receipt is saved for retry; the ledger will prevent duplicate payouts.","warn");
      }
    }
    openSafeProduct(product,actionType||"browse");
  }

  document.addEventListener("click",event=>{
    const link=event.target&&event.target.closest?event.target.closest("a.track"):null;
    if(!link)return;
    let url;
    try{url=new URL(link.href,location.href)}catch(_){return}
    if(!/(^|\.)shoplc\.com$/i.test(url.hostname))return;
    event.preventDefault();
    void handleShopLink(link);
  },true);

  async function loadFeaturedAuctions(){
    if(!rewardAuctionGrid)return;
    rewardAuctionGrid.innerHTML='<div class="reward-loading">Loading item-specific Shop LC auctions...</div>';
    try{
      const data=await publicLedger("/v1/shoplc/featured-auctions");
      const auctions=Array.isArray(data.auctions)?data.auctions.slice(0,6):[];
      if(!auctions.length){
        rewardAuctionGrid.innerHTML='<div class="reward-loading">Open Browse auctions above; no item-specific auction links are available right now.</div>';
        return;
      }
      rewardAuctionGrid.innerHTML=auctions.map((auction,index)=>{
        const code=String(auction.auctionCode||"").replace(/[^A-Za-z0-9_-]/g,"");
        const itemId=String(auction.itemId||"").replace(/[^A-Za-z0-9._:-]/g,"");
        const href=String(auction.href||"").replace(/"/g,"%22");
        return '<a class="shop-card track reward-link" data-track="featured-auction-'+(index+1)+'" data-reward-action="bid" data-item-id="'+itemId+'" href="'+href+'"><span>LIVE AUCTION · +5 STAR COINS</span><strong>Bid on item '+code.slice(0,10)+'</strong><p>One-time reward for this item-specific bid click. Shop LC handles the actual bid.</p><b>Bid on this item · +5 ⭐ →</b></a>';
      }).join("");
    }catch(error){
      rewardAuctionGrid.innerHTML='<div class="reward-loading">Open Browse auctions above; item-specific reward links will appear when the Shop LC auction feed is available.</div>';
    }
  }

  if(shopBrowserClose)shopBrowserClose.addEventListener("click",()=>{
    if(shopSafeProduct)shopSafeProduct.replaceChildren();
    if(shopBrowser)shopBrowser.hidden=true;
  });

  function updateClock(){if(clock)clock.textContent=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date())+" local"}
  function destroyHls(){if(hls){try{hls.destroy()}catch(_){}hls=null}}
  function setStatus(text){if(modeLabel)modeLabel.textContent=text}
  function tryPlay(){const p=player&&player.play();if(p&&typeof p.catch==="function")p.catch(()=>{})}

  function nextStream(){
    destroyHls();
    recoveries=0;
    failedFeeds+=1;
    if(failedFeeds>=STREAMS.length){
      setStatus("SHOP LC LIVE · RECONNECTING");
      streamIndex=0;
      setTimeout(()=>{failedFeeds=0;loadStream(0)},15000);
      return;
    }
    streamIndex=(streamIndex+1)%STREAMS.length;
    setStatus("SHOP LC LIVE · SWITCHING FEED "+(streamIndex+1)+"/"+STREAMS.length);
    setTimeout(()=>loadStream(streamIndex),900);
  }

  function loadStream(index){
    if(!player)return;
    const url=STREAMS[index];
    started=false;
    player.pause();
    player.removeAttribute("src");
    player.load();
    setStatus("SHOP LC LIVE · CONNECTING "+(index+1)+"/"+STREAMS.length);

    if(player.canPlayType("application/vnd.apple.mpegurl")){
      player.src=url;
      player.addEventListener("loadedmetadata",()=>{started=true;failedFeeds=0;setStatus("SHOP LC LIVE BROADCAST");tryPlay()},{once:true});
      return;
    }

    if(window.Hls&&window.Hls.isSupported()){
      hls=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:30,manifestLoadingTimeOut:12000,levelLoadingTimeOut:12000,fragLoadingTimeOut:15000});
      hls.attachMedia(player);
      hls.on(Hls.Events.MEDIA_ATTACHED,()=>hls.loadSource(url));
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{started=true;recoveries=0;failedFeeds=0;setStatus("SHOP LC LIVE BROADCAST");tryPlay()});
      hls.on(Hls.Events.ERROR,(_event,data)=>{
        if(!data||!data.fatal)return;
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&recoveries<1){recoveries++;try{hls.recoverMediaError();return}catch(_){}}
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&recoveries<1){recoveries++;try{hls.startLoad();return}catch(_){}}
        nextStream();
      });
      return;
    }

    setStatus("LIVE STREAM NEEDS A MODERN BROWSER");
  }

  if(player){
    player.addEventListener("playing",()=>{started=true;failedFeeds=0;setStatus("SHOP LC LIVE BROADCAST")});
    player.addEventListener("stalled",()=>{if(started&&hls){try{hls.startLoad()}catch(_){}}});
    player.addEventListener("error",()=>{if(!hls)nextStream()});
  }

  if(soundButton)soundButton.addEventListener("click",()=>{
    player.muted=!player.muted;
    if(!player.muted){player.volume=1;soundButton.textContent="Sound on";tryPlay();setTimeout(()=>soundButton.remove(),1200)}
    else soundButton.textContent="Tap for sound";
  });

  function localShareCredit(reference){
    const profile=parse("starquest_guest_profile_v1",{tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[]});
    profile.tokens=Math.max(0,Number(profile.tokens)||0);
    profile.shareCount=Math.max(0,Number(profile.shareCount)||0)+1;
    profile.pendingShareCredits=Math.max(0,Number(profile.pendingShareCredits)||0)+1;
    let awarded=0;
    while(profile.pendingShareCredits>=10){profile.pendingShareCredits-=10;profile.tokens+=1;awarded+=1}
    const id="shoplc-share-"+Date.now().toString(36);
    profile.shareEvents=(profile.shareEvents||[]).concat({id,contentId:reference,confirmed:true,createdAt:Date.now()}).slice(-250);
    profile.ledger=(profile.ledger||[]).concat({id:"tx-"+id,type:awarded?"share_reward":"share_credit",amount:awarded,balance:profile.tokens,pendingShareCredits:profile.pendingShareCredits,createdAt:Date.now()}).slice(-500);
    localStorage.setItem("starquest_guest_profile_v1",JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent("controlphi:wallet-change",{detail:{source:"shoplc-share"}}));
    return{awarded,progressToNextCoin:profile.pendingShareCredits};
  }

  if(shareButton)shareButton.addEventListener("click",async()=>{
    const data={title:"ShopLC Live Companion",text:"Watch Shop LC live with current shopping links, offers, auctions, and deals.",url:location.href};
    if(!navigator.share){try{await navigator.clipboard.writeText(data.url);shareStatus.textContent="Link copied."}catch(_){shareStatus.textContent="Sharing unavailable."}return}
    try{
      await navigator.share(data);
      const r=localShareCredit(data.url);
      shareStatus.textContent=r.awarded?"Shared · 1 Star Coin completed!":"Shared · Star Coin progress "+r.progressToNextCoin+"/10";
    }catch(e){if(!e||e.name!=="AbortError")shareStatus.textContent="Share did not complete."}
  });

  updateClock();
  setInterval(updateClock,1000);
  if(player){player.muted=true;loadStream(0)}
  void loadFeaturedAuctions();
})();
