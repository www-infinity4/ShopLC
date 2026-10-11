'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
test('ShopLC Buy click is saved under same ID as the five-coin reward request',()=>{
 assert.doesNotThrow(()=>new vm.Script(s));
 assert.match(s,/async function storeShopLcClick\(product,actionType,clickId\)/);
 assert.match(s,/const clickId=uid\("shoplc-click"\)/);
 assert.match(s,/clickId:clickId\|\|uid\("shoplc-signal"\)/);
 assert.match(s,/await storeShopLcClick\(product,actionType\|\|"browse",clickId\)/);
 assert.match(s,/await rewardShopLcClick\(\{actionType,itemId:product\.itemId,href:product\.href,clickId\}\)/);
});
test('each intentional click is preserved for retry instead of reusing the previous item receipt',()=>{
 assert.match(s,/pending\.some\(x=>x\.clickId===intent\.clickId\)/);
 assert.match(s,/pending\.find\(x=>x\.clickId===intent\.clickId\)/);
 assert.doesNotMatch(s,/pending\.some\(x=>x\.itemId===itemId/);
 assert.match(s,/data\.credited/);
 assert.match(s,/window\.parent\.location\.origin===location\.origin/);
 assert.match(s,/window\.parent\.ControlPhi\?\.refreshCloudWallet/);
});
test('visible reward confirmation and cache-busted ShopLC script remain in viewer',()=>{
 assert.equal((html.match(/id="rewardStatus"/g)||[]).length,1);
 assert.ok(html.indexOf('id="rewardStatus"')>html.indexOf('Buy this item'));
 assert.match(html,/app\.js\?v=20261011-wallet-readback2/);
});

test('confirmed 5-StarCoin message requires authenticated same-click wallet ledger readback',()=>{
 assert.match(s,/async function readBackShopLcReward\(clickId,token\)/);
 assert.match(s,/LEDGER_ENDPOINT\+"\/v1\/state"/);
 assert.match(s,/Authorization":"Bearer "\+token/);
 assert.match(s,/entry\.referenceId===clickId/);
 assert.match(s,/entry\.type==="shoplc_click_reward"/);
 assert.match(s,/Number\(entry\.amount\)===5/);
 assert.match(s,/entry\.payoutStatus==="credited_click_reward"/);
 assert.match(s,/if\(!proof\.confirmed\)/);
 assert.match(s,/applyCloudStarState\(proof\.state\)/);
 assert.match(s,/StarCoins VERIFIED in the connected StarQuest wallet/);
 assert.match(s,/wallet_account_mismatch/);
 assert.match(s,/No additional reward was issued; the robot will audit/);
 assert.doesNotMatch(s,/setRewardStatus\("\+5 Star Coins credited/);
});
