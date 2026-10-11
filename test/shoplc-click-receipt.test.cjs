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
 assert.match(html,/app\.js\?v=20261011-shared-receipt1/);
});
