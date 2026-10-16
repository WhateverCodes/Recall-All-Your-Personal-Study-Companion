const codePattern=/\b(?:def\s+\w+\s*\(|class\s+\w+\s*[:{]|function\s*\w*\s*\(|SELECT\s+[\s\S]+?\bFROM\b|(?:const|let|var)\s+\w+\s*=|#include\s*<|public\s+static|list\s*\(\s*map\s*\(|for\s+\w+\s+in\s+|return\s+\w+\s*[;+])|\b\w+\.(?:append|split|push|pop|sort|join)\s*\(/i;
const conceptPattern=/\b(?:function|method|parameter|argument|return value|loop|recursion|recursive|dictionary|hash map|stack|queue|binary search|time complexity|space complexity|GROUP BY|HAVING|LEFT JOIN|INNER JOIN|aggregate|list comprehension|slicing|mutable|immutable|iterator|integer division|modulo)\b/i;
function codingSource(entry){return /(?:codeforces|leetcode|neetcode|hackerrank|atcoder|codechef)\./i.test(entry.url||entry.source||'')||entry.kind==='code'||entry.id==='user-solution'||codePattern.test(entry.text||'');}
function usableSource(entry){
 if(entry.kind!=='audio'&&/^http:\/\/127\.0\.0\.1:43127(?:\/|$)/.test(entry.url||''))return false;
 if(!codingSource(entry))return true;
 return codePattern.test(entry.text||'')||conceptPattern.test(entry.text||'');
}
function exerciseSource(source){return /aptitude|reasoning|(?:exam|gate).*question|problem statement/i.test((source.title||'')+' '+(source.url||''))||/startup founders|siblings.*same room|office.*three rooms/i.test(source.text||'');}
function acceptableQuestion(q,source){
 if(q.kind==='local-cloze'||/_{3,}/.test(q.prompt||''))return false;
 const prompt=q.prompt||'';
 // Context lookup is not a transferable learning objective, even outside coding sites.
 if(/according to (?:the )?(?:rules|passage|story)|as described in the passage|how many (?:total )?rooms|siblings.*(?:share|same).*room/i.test(prompt))return false;
 if(exerciseSource(source)&&!codingSource(source)){
   // A reasoning exercise must carry its premises and ask for a deduction or method.
   if(!/given|suppose|assume/i.test(prompt)||! /deduc|infer|arrangement|permutation|combination|probability|why|which.*(?:must|cannot|could)|how many.*(?:ways|valid)/i.test(prompt))return false;
 }
 if(!codingSource(source))return true;
 if(!usableSource(source))return false;
 if(/output specification|input specification|winning strategy|user\s*\d+|robot identifiers|guaranteed.*(?:different|distinct)|(?:maximum|minimum) (?:value|number).*(?:test cases|constraints)|(?:print|output).*(?:YES|NO|ALICE|BOB)/i.test(prompt))return false;
 if(/(?:provided|above|following|this|given).*?(?:code|query|snippet)|variable\s+[`'"\w]|inside (?:the )?loop/i.test(prompt)&&!(typeof q.code==='string'&&q.code.trim()))return false;
 if(/how is (?:the )?variable|what (?:is|was) the (?:name|value) of (?:the )?variable/i.test(prompt))return false;
 return conceptPattern.test(prompt)||codePattern.test(prompt)||!!(q.code&&codePattern.test(q.code));
}
module.exports={codingSource,usableSource,acceptableQuestion};
