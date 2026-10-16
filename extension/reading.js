(function(root) {
  'use strict';
  // A transparent heuristic, not a validated measure of comprehension.
  function step(previous = {}, sample = {}) {
    const words = Math.max(1, Number(sample.words) || 1);
    const requiredSeconds = Math.max(4, Math.min(90, words / 220 * 60 * .65));
    const eligible = sample.focused === true && sample.visibleFraction >= .65 &&
      sample.idleSeconds < 120 && Math.abs(sample.speed) < 160;
    const elapsed = Math.max(0, Math.min(1.5, Number(sample.elapsed) || 0));
    const seconds = (previous.seconds || 0) + (eligible ? elapsed : 0);
    return {seconds, requiredSeconds, confidence: Math.min(1, seconds / requiredSeconds),
      qualified: seconds >= requiredSeconds};
  }
  function visibleCode(document,height,width){
    const result=[];
    for(const editor of document.querySelectorAll('.monaco-editor .view-lines,.cm-editor .cm-content,.CodeMirror-code,.ace_text-layer')){
      if(!editor.matches?.('.view-lines,.cm-content,.CodeMirror-code,.ace_text-layer'))continue;
      const box=editor.getBoundingClientRect();if(box.bottom<=0||box.top>=height||box.right<=0||box.left>=width||box.width<=0||box.height<=0)continue;
      const lines=[...editor.querySelectorAll('.view-line,.cm-line,pre,.ace_line')].filter(line=>{
        const rect=line.getBoundingClientRect();return rect.bottom>Math.max(0,box.top)&&rect.top<Math.min(height,box.bottom)&&!line.closest('[aria-hidden="true"],[hidden]');
      });
      const text=lines.map(line=>line.innerText).filter(Boolean).join('\n').trim();
      if(text.length>=40&&text.length<=12000)result.push({element:editor,text});
    }
    return result;
  }
  function videoProgress(previous,current){
    if(!current.visible||current.paused||current.ended||current.seeking||current.readyState<2||!previous)return false;
    const elapsed=(current.at-previous.at)/1000,progress=current.seconds-previous.seconds;
    return elapsed>0&&elapsed<=3&&progress>0&&progress<=elapsed*Math.max(1,current.rate||1)+.5;
  }
  const api = { step,visibleCode,videoProgress };
  if (typeof module !== 'undefined') module.exports = api;
  else root.StudyReading = api;
})(globalThis);
