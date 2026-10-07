(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const STREAMS=[
    "https://cdn-shop-lc-01.vos360.video/Content/HLS_HLS/Live/channel%28ShopLCStirrTV%29/master.m3u8",
    "https://cdn-shop-lc-01.akamaized.net/Content/HLS_HLS/Live/channel%28ott%29/master.m3u8",
    "https://cdn-shop-lc-01.akamaized.net/Content/HLS_HLS/Live/channel%28xumo%29/index.m3u8"
  ];
  let streamIndex=0,hls=null,started=false,recoveries=0,failedFeeds=0;
  const player=$("player"),clock=$("stationClock"),soundButton=$("soundButton"),shareButton=$("shareButton"),shareStatus=$("shareStatus"),modeLabel=$("modeLabel");

  function parse(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(_){return fallback}}\n\n  document.querySelectorAll("a.track").forEach(link=>{
    link.addEventListener("click",()=>{
      const events=parse("shoplc_click_events_v1",[]);
      events.push({id:link.dataset.track||"link",href:link.href,at:Date.now()});
      localStorage.setItem("shoplc_click_events_v1",JSON.stringify(events.slice(-250)));
    });
  });

  function updateClock(){clock.textContent=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date())+" local"}
  function destroyHls(){if(hls){try{hls.destroy()}catch(_){}hls=null}}
  function setStatus(text){if(modeLabel)modeLabel.textContent=text}
  function tryPlay(){const p=player.play();if(p&&typeof p.catch==="function")p.catch(()=>{})}

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
    setStatus(`SHOP LC LIVE · SWITCHING FEED ${streamIndex+1}/${STREAMS.length}`);
    setTimeout(()=>loadStream(streamIndex),900);
  }

  function loadStream(index){
    const url=STREAMS[index];
    started=false;
    player.pause();
    player.removeAttribute("src");
    player.load();
    setStatus(`SHOP LC LIVE · CONNECTING ${index+1}/${STREAMS.length}`);

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

  player.addEventListener("playing",()=>{started=true;failedFeeds=0;setStatus("SHOP LC LIVE BROADCAST")});
  player.addEventListener("stalled",()=>{if(started&&hls){try{hls.startLoad()}catch(_){}}});
  player.addEventListener("error",()=>{if(!hls)nextStream()});

  soundButton.addEventListener("click",()=>{
    player.muted=!player.muted;
    if(!player.muted){player.volume=1;soundButton.textContent="Sound on";tryPlay();setTimeout(()=>soundButton.remove(),1200)}
    else soundButton.textContent="Tap for sound";
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
    const data={title:"ShopLC Live Companion",text:"Watch Shop LC live with current shopping links, offers, auctions, and deals.",url:location.href};
    if(!navigator.share){try{await navigator.clipboard.writeText(data.url);shareStatus.textContent="Link copied."}catch(_){shareStatus.textContent="Sharing unavailable."}return}
    try{await navigator.share(data);const r=localShareCredit(data.url);shareStatus.textContent=r.awarded?"Shared · 1 StarCoin completed!":`Shared · StarCoin progress ${r.progressToNextCoin}/10`}catch(e){if(!e||e.name!=="AbortError")shareStatus.textContent="Share did not complete."}
  });

  updateClock();setInterval(updateClock,1000);
  player.muted=true;
  loadStream(0);
})();
