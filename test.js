var app = require('express')();
var mongoClient = require('mongodb').MongoClient;
var mongoURL ='mongodb://ghj:lxy@localhost:27017/corpus'
var spawn = require('child_process').spawn;
var https = require('https');

let query_searcher = spawn('python',['./lucene_searcher/search.py', '-d'])
let in_data = {type:'query', params: {text:'为什么我没有男朋友',num:0, user_info:{nickName:"林心宜",gender:1,language:"zh_CN",city:"",province:"Beijing",country:"China",avatarUrl:"https://wx.qlogo.cn/mmopen/vi_32/iaewM57PIMz9LQ9oWkJqKFR13R78qmVYTfbCm78CvzoywaDHV04y3ib5rKSvVepyPCQpz2kuMXpUfHgfhD5sDHNg/0"}}}
// console.log(JSON.stringify(in_data))
let out_data = ''
query_searcher.stdin.write(JSON.stringify(in_data))
query_searcher.stdout.on('data', function(data){
    console.log(data.toString())
    out_data+=data.toString()
})
query_searcher.stdout.on('end', function(){
    // if (out_data.status===200){
    //     console.log(out_data.content)
    //     res.status(200).send({type:'item', content: out_data.content})
    // } else {
    //     console.log(out_data.content)
    //     res.status(404).send(out_data.content)
    // }
    console.log(out_data)
})
query_searcher.stderr.on('data', (data) => {
    console.log(`错误：${data}`);
});
query_searcher.stdin.end()


// mongoClient.connect(mongoURL, function(err,client){
//     assert.equal(null,err);
//     console.log("Connected successfully to mongo server");
//     let db = client.db('corpus')
//     let col = db.collection('article_collection')
//     let value = reqParams.id
//     col.findOne({a_id:value}, function(err, result){
//         if(err){
//             console.log(err);
//             res.status(404).send({err_msg: err})
//             client.close();
//             return
//         }
//         let out_data = {type:'article'};
//         out_data.content={title:result.title,text:result.text};
//         res.status(200).send(out_data)
//         client.close();
//     });
// })

// let OpenIdUrl='https://api.weixin.qq.com/sns/jscode2session?appid=wx7114be5b818fdb3c&secret=6c7b6c9fd08fd747dc9dd2c6029c141d'
// // let JSCODE = '013Kevpx1Fii7g09fvnx1rOUpx1Kevpo'
// let JSCODE = '003Nk5Ne0lwg3B1JowMe0wKdNe0Nk5NR'
// let url = OpenIdUrl + '&js_code='+JSCODE + '&grant_type=authorization_code'
// https
//     .get(url, (res) => {
//         console.log('statusCode:', res.statusCode);
//         console.log('headers:', res.headers);
//         res.on('data', (d) => {
//             console.log(JSON.parse(d));
//             // do something.
//         });
//     }).on('error', (e) => {
//         console.error(e);
//     });