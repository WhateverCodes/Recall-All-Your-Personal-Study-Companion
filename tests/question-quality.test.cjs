const test=require('node:test'),assert=require('node:assert/strict');
const {usableSource,acceptableQuestion}=require('../question-quality.cjs');const {generate,validateQuiz}=require('../quiz-ai.cjs');
test('rejects the reported coding-problem trivia and dashboard captures',()=>{
 const source={url:'https://codeforces.com/problemset/problem/1/A',text:'If Alice has a winning strategy, output YES. It is guaranteed that all identifiers are different.'};
 assert.equal(usableSource(source),false);
 for(const prompt of ['According to the output specification, what should be output if Alice has a winning strategy?','Are all robot identifiers guaranteed to be different?','User 14 is included because they logged in during 2020.'])assert.equal(acceptableQuestion({prompt,kind:'boolean'},source),false);
 assert.equal(usableSource({url:'http://127.0.0.1:43127/',text:'Your study day'}),false);
});
test('code semantics questions pass evidence checks',()=>{
 const text='values = list(map(int, input().split()))';const source={id:'py',url:'https://leetcode.com/problems/example/solutions/',text};
 const question={kind:'short',prompt:'In Python, which method splits the input string into whitespace-separated tokens?',answer:'split',options:[],acceptedAnswers:['split()'],explanation:'split() separates the input string on whitespace.',sourceId:'py',evidence:text,code:text};
 assert.equal(usableSource(source),true);assert.equal(validateQuiz({questions:[question]},[source]).length,1);
 const sql={url:'https://neetcode.io/practice',text:'SELECT user_id, MAX(login_date) FROM Logins GROUP BY user_id;'};
 assert.equal(usableSource(sql),true);assert.equal(acceptableQuestion({kind:'short',prompt:'What does GROUP BY user_id do before the aggregate MAX is calculated?'},sql),true);
 assert.equal(acceptableQuestion({kind:'boolean',prompt:'User 14 is included because they logged in during 2020.'},sql),false);
});
test('statement-only material does not spend API quota',async()=>{
 let calls=0;await assert.rejects(generate([{id:'x',url:'https://codeforces.com/problemset/problem/1/A',text:'If Alice has a winning strategy, output YES. Otherwise output NO.'}],'',async()=>{calls++;}),/Not enough programming concepts/);assert.equal(calls,0);
});

test('rejects aptitude premise recall and questions about unseen variables',()=>{
 const aptitude={title:'GATE ECE 2024 Aptitude English Question 2',text:'The office has three rooms. The siblings should not share the same room.'};
 assert.equal(acceptableQuestion({kind:'boolean',prompt:'According to the rules agreed upon by the startup founders, the siblings must not share the same room.'},aptitude),false);
 assert.equal(acceptableQuestion({kind:'short',prompt:'How many total rooms does the startup office have, as described in the passage?'},aptitude),false);
 const code={url:'https://codeforces.com/submit',text:'for i in range(n): farthest = max(farthest, a[i])'};
 assert.equal(acceptableQuestion({kind:'mcq',prompt:'In the provided Python code, how is the variable farthest updated inside the loop?'},code),false);
 assert.equal(acceptableQuestion({kind:'mcq',prompt:'In Python, why does this loop maintain a running maximum?',code:'for value in values: current = max(current, value)'},code),true);
 assert.equal(acceptableQuestion({kind:'short',prompt:'Given three distinct people and three distinct rooms, one person per room, how many arrangements are possible?'},aptitude),true);
});
