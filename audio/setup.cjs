// Optional one-time installer. Dashboard Connections shows its progress too.
const {LocalSpeech}=require('./local-speech.cjs');
new LocalSpeech().setup().then(()=>console.log('Local speech setup complete.')).catch(error=>{console.error(error.message);process.exitCode=1;});
