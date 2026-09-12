(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const VIDEO_IDS=["eqpG55UKM8M","1P-CaNhOeBo"];
  let videoIndex=0,player=null,ready=false;
  const clock=$("stationClock"),soundButton=$("soundButton"),shareButton=$("shareButton"),shareStatus=$("shareStatus");
  const commercial={card:$("commercialCard"),eyebrow:$("commercialEyebrow"),title:$("commercialTitle"),copy:$("commercialCopy"),cta:$("commercialCta"),counter:$("commercialCounter")};
  const metricsEls={impressions:$("impressionsCount"),clicks:$("clicksCount"),ctr:$("ctrCount")};

  const spots=[
    {id:"current-item",eyebrow:"CONTEXTUAL BREAK · ON-AIR INTENT",title:"See the item while the host is still selling it",copy:"The highest-intent moment is usually right now. Keep the show running, open Shop LC’s current-on-air product page, and let the viewer decide before the segment moves on.",cta:"Shop what’s airing",url:"https://www.shoplc.com/pages/live-tv"},
    {id:"auction",eyebrow:"CONTEXTUAL BREAK · GAMIFIED VALUE",title:"Turn bargain energy into a $1 auction visit",copy:"When the show is already creating urgency, an auction is a natural second destination. This spot tests whether viewers respond better to participation than to another traditional product pitch.",cta:"Enter the auctions",url:"https://www.shoplc.com/pages/online-auctions-ra?categoryname=Rings%2CBracelets%2CNecklaces%2CSets%2CEarrings%2CPendants&sort=enddate&sortorder=1"},
    {id:"hot-deals",eyebrow:"CONTEXTUAL BREAK · PRICE DISCOVERY",title:"One clean deal button instead of another long commercial",copy:"Use the program to create desire, then give the viewer a simple price-discovery path. The page does not copy prices that may expire; Shop LC remains the source of truth.",cta:"See hot deals",url:"https://www.shoplc.com/collections/hot-deals"},
    {id:"special-offers",eyebrow:"CONTEXTUAL BREAK · VALUE SHOPPER",title:"Catch the viewer who likes the show but not the exact item",copy:"A broad special-offer shelf gives the audience somewhere relevant to go even when the item on television is not their style. That makes the commercial useful instead of interruptive.",cta:"Browse special offers",url:"https://www.shoplc.com/collections/special-offer"},
    {id:"under-50",eyebrow:"CONTEXTUAL BREAK · LOW-FRICTION ENTRY",title:"Sell the first click with a lower-price shopping lane",copy:"Not every viewer is ready for a high-ticket gemstone. A lower-price lane can convert curiosity into a first purchase and keep the shopping session alive.",cta:"Browse Shop LC",url:"https://www.shoplc.com/collections/offer-items"}
  ];

  function parse(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(_){return fallback}}
  function metrics(){return parse("shoplc_ad_metrics_v1",{impressions:0,clicks:0,spotViews:{},spotClicks:{}})}
  function saveMetrics(m){localStorage.setItem("shoplc_ad_metrics_v1",JSON.stringify(m));renderMetrics(m)}
  function renderMetrics(m){const ctr=m.impressions?((m.clicks/m.impressions)*100).toFixed(1):"0.0";metricsEls.impressions.textContent=m.impressions;metricsEls.clicks.textContent=m.clicks;metricsEls.ctr.textContent=`${ctr}%`}

  let activeSpot=-1;
  function showSpot(index){
    const i=((index%spots.length)+spots.length)%spots.length;
    if(i===activeSpot)return;
    activeSpot=i;
    const spot=spots[i];
    commercial.eyebrow.textContent=spot.eyebrow;
    commercial.title.textContent=spot.title;
    commercial.copy.textContent=spot.copy;
    commercial.cta.textContent=spot.cta;
    commercial.cta.href=spot.url;
    commercial.cta.dataset.commercialId=spot.id;
    commercial.counter.textContent=`Commercial concept ${i+1} of ${spots.length} · rotates every 45 seconds`;
    const m=metrics();
    m.impressions+=1;m.spotViews[spot.id]=(m.spotViews[spot.id]||0)+1;saveMetrics(m);
  }

  commercial.cta.addEventListener("click",()=>{
    const id=commercial.cta.dataset.commercialId||"unknown";
    const m=metrics();m.clicks+=1;m.spotClicks[id]=(m.spotClicks[id]||0)+1;saveMetrics(m);
  });

  document.querySelectorAll("a.track").forEach(link=>{
    link.addEventListener("click",()=>{
      const events=parse("shoplc_click_events_v1",[]);
      events.push({id:link.dataset.track||"link",href:link.href,at:Date.now()});
      localStorage.setItem("shoplc_click_events_v1",JSON.stringify(events.slice(-250)));
    });
  });

  function updateClock(){clock.textContent=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date())+" local"}

  function loadYouTubeApi(){
    if(window.YT&&window.YT.Player){initPlayer();return}
    window.onYouTubeIframeAPIReady=initPlayer;
    const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.referrerPolicy="strict-origin-when-cross-origin";document.head.appendChild(s);
  }

  function initPlayer(){
    if(player)return;
    player=new YT.Player("player",{
      videoId:VIDEO_IDS[videoIndex],width:"100%",height:"100%",
      playerVars:{autoplay:1,mute:1,playsinline:1,controls:1,rel:0,modestbranding:1,enablejsapi:1,origin:location.origin,widget_referrer:location.href},
      events:{
        onReady:()=>{ready=true;try{player.mute();player.playVideo()}catch(_){}},
        onStateChange:e=>{if(e.data===YT.PlayerState.ENDED)loadFallback()},
        onError:()=>loadFallback()
      }
    });
  }

  function loadFallback(){
    if(!ready||VIDEO_IDS.length<2)return;
    videoIndex=(videoIndex+1)%VIDEO_IDS.length;
    try{player.loadVideoById(VIDEO_IDS[videoIndex]);player.mute();player.playVideo()}catch(_){}
  }

  soundButton.addEventListener("click",()=>{
    if(!ready)return;
    try{
      if(player.isMuted()){player.unMute();player.setVolume(100);soundButton.textContent="Sound on";setTimeout(()=>soundButton.remove(),1200)}
      else{player.mute();soundButton.textContent="Tap for sound"}
    }catch(_){}
  });

  function localShareCredit(reference){
    const profile=parse("starquest_guest_profile_v1",{tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[]});
    profile.tokens=Math.max(0,Number(profile.tokens)||0);profile.shareCount=Math.max(0,Number(profile.shareCount)||0)+1;profile.pendingShareCredits=Math.max(0,Number(profile.pendingShareCredits)||0)+1;
    let awarded=0;while(profile.pendingShareCredits>=10){profile.pendingShareCredits-=10;profile.tokens+=1;awarded+=1}
    const id=`shoplc-share-${Date.now().toString(36)}`;
    profile.shareEvents=(profile.shareEvents||[]).concat({id,contentId:reference,confirmed:true,createdAt:Date.now()}).slice(-250);
    profile.ledger=(profile.ledger||[]).concat({id:`tx-${id}`,type:awarded?"share_reward":"share_credit",amount:awarded,balance:profile.tokens,pendingShareCredits:profile.pendingShareCredits,createdAt:Date.now()}).slice(-500);
    localStorage.setItem("starquest_guest_profile_v1",JSON.stringify(profile));
    return{awarded,progressToNextCoin:profile.pendingShareCredits};
  }

  shareButton.addEventListener("click",async()=>{
    const data={title:"ShopLC Live Companion",text:"Watch Shop LC live with current shopping links and a smarter commercial experiment.",url:location.href};
    if(!navigator.share){try{await navigator.clipboard.writeText(data.url);shareStatus.textContent="Link copied."}catch(_){shareStatus.textContent="Sharing unavailable."}return}
    try{await navigator.share(data);const r=localShareCredit(data.url);shareStatus.textContent=r.awarded?"Shared · 1 StarCoin completed!":`Shared · StarCoin progress ${r.progressToNextCoin}/10`}catch(e){if(!e||e.name!=="AbortError")shareStatus.textContent="Share did not complete."}
  });

  renderMetrics(metrics());
  showSpot(Math.floor(Date.now()/45000));
  setInterval(()=>showSpot(Math.floor(Date.now()/45000)),1000);
  updateClock();setInterval(updateClock,1000);
  loadYouTubeApi();
})();
