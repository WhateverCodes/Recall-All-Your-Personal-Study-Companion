const test=require('node:test'),assert=require('node:assert/strict');
const {videoProgress}=require('../extension/reading.js');
test('video study continues during passive playback but excludes pause, buffering, seeking and hidden video',()=>{
 const previous={at:1000,seconds:10};const playing={at:2000,seconds:11,rate:1,visible:true,paused:false,ended:false,seeking:false,readyState:4};
 assert(videoProgress(previous,playing));assert(videoProgress(previous,{...playing,seconds:12,rate:2}));
 for(const change of [{paused:true},{ended:true},{seeking:true},{visible:false},{readyState:1},{seconds:10},{seconds:100},{at:90000}])assert.equal(videoProgress(previous,{...playing,...change}),false,JSON.stringify(change));
 assert.equal(videoProgress(null,playing),false);
});
