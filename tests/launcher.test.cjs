const test=require('node:test'),assert=require('node:assert/strict');
const {launch,isDashboard}=require('../launch-dashboard.cjs');
test('opens dashboard only after server is ready',async()=>{
  const events=[],app={};
  assert.equal(await launch({start:async()=>{events.push('ready');return app;},open:async url=>{assert.equal(url,'http://127.0.0.1:43127/');events.push('open');}}),app);
  assert.deepEqual(events,['ready','open']);
});
test('reuses Recall-All and rejects unrelated occupied ports',async()=>{
  let opens=0;const start=async()=>{throw Object.assign(Error('busy'),{code:'EADDRINUSE'});};
  await launch({start,probe:async()=>true,open:async()=>opens++});
  assert.equal(opens,1);
  await assert.rejects(launch({start,probe:async()=>false,open:async()=>opens++}),/Another app/);
  assert.equal(opens,1);
});
test('recognizes existing dashboard without accessing study data',async()=>{
  assert.equal(await isDashboard(async url=>{assert.equal(url,'http://127.0.0.1:43127/');return {ok:true,text:async()=>'<title>Recall-All — Your study day</title>'};}),true);
  assert.equal(await isDashboard(async()=>({ok:true,text:async()=>'<title>Other app</title>'})),false);
});
