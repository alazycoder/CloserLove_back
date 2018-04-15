// Dependency
var app = require('express')();
var mongoClient = require('mongodb').MongoClient;
var mongoURL ='mongodb://ghj:lxy@localhost:27017/corpus'
var spawn = require('child_process').spawn;
var fs = require('fs');
var https = require('https');
var privateKey  = fs.readFileSync('./certificate/private.pem', 'utf8');
var certificate = fs.readFileSync('./certificate/file.crt','utf8');
var root_bundle = fs.readFileSync('./certificate/root_bundle.crt','utf8');
var credentials = {key: privateKey, cert: certificate,ca:[root_bundle]};
var httpsServer = https.createServer(credentials, app);
var SSLPORT = 443;
var assert = require('assert');
var bodyParser = require('body-parser');
var OpenIdUrl = 'https://api.weixin.qq.com/sns/jscode2session?appid=wx7114be5b818fdb3c&secret=6c7b6c9fd08fd747dc9dd2c6029c141d'
httpsServer.listen(SSLPORT, function() {
    console.log('HTTPS Server is running on: https://localhost:%s', SSLPORT);
});
app.use(bodyParser.json({strict: false}));

// Message
const GetRequest = "====== query is ======"
const SendRequest = "'====== request is ======'"
const FailToConnect = "****** Failed to connect to mongo server ******"
const SuccessToConnect = "------ Connected successfully to mongo server ------"
const FailToFindItem = "****** Failed to find items in the collection ******"
const FailToFindCol = "****** Failed to find collection ******"
const SuccessToInitRead = "------ Init the first read ------"
const UnknownError = "******Error******"

// Function
function sendErrMsg(res, errmsg, err){
    console.log(errmsg)
    console.log(err)
    res.status(500).send({err_msg: err})
}
function shuffleArray(arr){
    let temp_array = new Array();
    arrLen = arr.length
    for (let index=0; index<arrLen; index++) {
        temp_array.push(arr[index]);
        // 排序主键 TODO: 根据like，time，click，view
        temp_array[index].sort_key = Math.floor(Math.random()*(arrLen))
    }
    temp_array.sort(function(a,b){
        return b.sort_key-a.sort_key;
        // b-a > 0 ==> b,a
        // b-a < 0 ==> a,b
    })
    return temp_array
    
}
function requestSaved(query, rep){
    mongoClient.connect(mongoURL, function(err, client){
        if (err){
            console.log(FailToConnect)
            client.close()
            return
        }
        db = client.db('corpus')
        userCol = db.collection('request_collection')
        request = {open_id:query.open_id, type:query.type, params:query.params, time:Date.now(), reply: rep}
        userCol.insertOne(request, function(err, r){
            if(err){
                console.log("Some error when inserting request.")
                console.log(err)
            }
            client.close()
            return
        })  
    })
}
function getLike(db, openId, category, id){
    return new Promise(function(resolve, reject){
        let col = db.collection('like_collection')
        let value = {open_id: openId, issue_id:category+id}
        let content = {}
        col.findOne(value, function(err, result){
            if(err){
                reject(e)
                return;
            }
            if(result){
                content.isLike = result.like;
                content.isDislike = result.dislike;
                resolve(content);
                return;
            }
            console.log("===The first read for user to article===");
            value.like = 0
            value.dislike = 0
            value.time = Date.now()
            col.insertOne(value, function(e, r){
                if (e){
                    reject(e)
                    return;
                }
                console.log(SuccessToInitRead)
            })
            content.isLike = 0
            content.isDislike = 0
            resolve(content);
        })
    });
}

// Router
app.get('/init', function(req, res){
    if(req.protocol === 'https'){
        let reqParams = JSON.parse(req.query.params)
        url = OpenIdUrl + '&js_code='+reqParams.JSCODE + '&grant_type=authorization_code'
        https.get(url, (result) => {
                console.log('statusCode:', result.statusCode);
                console.log('headers:', result.headers);
                result.on('data', (d) => {
                    data = JSON.parse(d)
                    console.log(data);
                    if(data.errcode){
                        res.status(500).send({err_msg: data.errmsg})
                        return
                    }
                    res.status(200).send({open_id:data.openid})
                    // do something.
                });
            }).on('error', (e) => {
                console.error(e);
            });
    }
});
app.get('/QA', function(req, res){
    if(req.protocol === 'https'){
        // console.log(req.query)
	    let reqType = req.query.type
        let reqParams = JSON.parse(req.query.params)
        console.log(GetRequest)
        console.log(req.query)
        if (reqType==='query') {
            let query_searcher = spawn('python',['./lucene_searcher/search.py', '-d'])
            let in_data = {type:reqType, params: reqParams}
            console.log(JSON.stringify(in_data))
            let out_data = ''
            query_searcher.stdin.write(JSON.stringify(in_data))
            query_searcher.stdout.on('data', function(data){
                // console.log('here')
                // console.log(data.toString())
                out_data += data.toString()
                // out_data = JSON.parse(data.toString())
            })
            query_searcher.stdout.on('end', function(){
                out_data = JSON.parse(out_data)
                if (out_data.status===200){
                    // console.log('come here')
		            console.log(out_data.content)
                    res.status(200).send({type:'list', content: out_data.content})
                } else {
                    // console.log('come there')
		            console.log(out_data.content)
                    res.status(500).send(out_data.content)
                }
                requestSaved(req, out_data.content)
            })
            query_searcher.stdin.end()

            // console.log(out_data)
        } else {
            sendErrMsg(res, UnknownError, '[QA] No such type. Should be query.')
        }
        // res.status(200).send({status:"200",type:"item",content:req.query.params.text});
    } else {
        sendErrMsg(res, UnknownError, '[QA] Should be HTTPS.')
    }
    return
});
app.get('/search', function(req, res){
    if(req.protocol === 'https'){
        // console.log(req.query)
        let reqType = req.query.type
        let reqOpenId = req.query.open_id
        let reqParams = JSON.parse(req.query.params)
        console.log(GetRequest)
        console.log(req.query)
        if (reqType === 'article'){
            console.log("Article Searching ...")
            mongoClient.connect(mongoURL, function(err,client){
                assert.equal(null,err);
                if(err){
                    sendErrMsg(res, FailToConnect, err)
                    client.close()
                    return
                }
                console.log(SuccessToConnect);
                let db = client.db('corpus')
                function getArticle(){
                    return new Promise(function(resolve, reject){
                        let col = db.collection('article_collection')
                        let content = {}
                        col.findOneAndUpdate({a_id: reqParams.id}, {$inc:{click:1}}, function(error, result){
                            if(error){
                                reject(error)
                                return;
                            }
                            if (result.ok){
                                // console.log(result)
                                content.title = result.value.title
                                content.text = result.value.text
                                content.like = result.value.like
                                content.dislike = result.value.dislike
                                content.likeInfo = {type:reqType, id:reqParams.id}
                                console.log(content)
                                console.log("============")
                                resolve(content)
                            }
                            else{
                                reject(FailToFindItem)
                                return
                            }
                        })
                    });
                }
                Promise.all([getArticle(),getLike(db, reqOpenId, reqType, reqParams.id)])
                .then(function(values){
                    console.log(SendRequest)
                    let out_data = {type:'article', content:{}}
                    out_data.content.title = values[0].title;
                    out_data.content.text = values[0].text;
                    out_data.content.like = values[0].like;
                    out_data.content.dislike = values[0].dislike;
                    out_data.content.likeInfo = values[0].likeInfo;
                    out_data.content.isLike = values[1].isLike;
                    out_data.content.isDislike = values[1].isDislike;
                    console.log(out_data)
                    res.status(200).send(out_data)
                    client.close();
                })
                .catch(function(error){
                    sendErrMsg(res, UnknownError, error)
                    client.close();
                    return
                });
            })
        } else if (reqType === 'item'){
            console.log("ITEM Searching ...")
            mongoClient.connect(mongoURL, function(err,client){
                // assert.equal(null,err);
                if(err){
                    sendErrMsg(res, FailToConnect, err)
                    client.close()
                    return
                }
                console.log(SuccessToConnect);
                let db = client.db('corpus')
                // let out_data = {type:'article',content:{}}
                function getItem(){
                    return new Promise(function(resolve, reject){
                        let col = db.collection('item_collection')
                        let content = {}
                        col.findOneAndUpdate({i_id: reqParams.id}, {$inc:{click:1}}, function(error, result){
                            if(error){
                                reject(error)
                                return;
                            }
                            if (result.ok){
                                content.title = result.value.title
                                content.text = result.value.text
                                content.like = result.value.like
                                content.dislike = result.value.dislike
                                content.likeInfo = {type:reqType, id:reqParams.id}
                                resolve(content)
                            }
                            else{
                                reject(FailToFindItem)
                                return
                            }
                        })
                    })
                }
                Promise.all([getItem(),getLike(db, reqOpenId, reqType, reqParams.id)])
                .then(function(values){
                    console.log(SendRequest)
                    let out_data = {type:'article', content:{}}
                    out_data.content.title = values[0].title;
                    out_data.content.text = values[0].text;
                    out_data.content.like = values[0].like;
                    out_data.content.dislike = values[0].dislike;
                    out_data.content.likeInfo = values[0].likeInfo;
                    out_data.content.isLike = values[1].isLike;
                    out_data.content.isDislike = values[1].isDislike;
                    // console.log(out_data)
                    res.status(200).send(out_data)
                    client.close();
                })
                .catch(function(error){
                    sendErrMsg(res, UnknownError, error)
                    client.close();
                    return
                });
            })
        } else if (reqType === 'class'){
            console.log("CLASS Searching ...")
            mongoClient.connect(mongoURL, function(err,client){
                // assert.equal(null,err);
                if(err){
                    sendErrMsg(res, FailToConnect, err)
                    client.close()
                    return
                }
                console.log(SuccessToConnect);
                let db = client.db('corpus')
                let value = reqParams.id
                // console.log("====== Class COLLECTIONS ======")
                // col.find().toArray(function(err, result){
                //     console.log(result)
                // })
                function getClass(){
                    return new Promise(function(resolve, reject){
                        console.log("Finding Class...")
                        let col = db.collection('class_collection')
                        col.findOneAndUpdate({c_id:value},{$inc:{click:1}}, function(error, result){
                            if(error){
                                reject(error);
                                return
                            }
                            if(result.ok){
                                let content = {title: result.value.title}
                                resolve(content)
                            } else{
                                reject(FailToFindItem)
                            }
                        })
                    })
                }
                function getItem(){
                    return new Promise(function(resolve, reject){
                        console.log("Finding Items")
                        let col = db.collection('item_collection')
                        let items = []
                        col.find({class:value}).toArray(function(error, result){
                            if(error){
                                reject(error)
                                return
                            }
                            choosedItems = shuffleArray(result).slice(0,50)
                            for(choosedItem of choosedItems){
                                items.push({title:choosedItem.title, ref:{type:'item', params:{id:choosedItem.i_id}}});
                            }
                            resolve(items)
                        })
                    })
                }
                Promise.all([getClass(), getItem()])
                .then(function(values){
                    console.log(SendRequest)
                    let out_data = {type:'list',content:{}}
                    out_data.content = values[0]
                    out_data.content.items = values[1]
                    res.status(200).send(out_data)//发现这个放在find之外，即使函数中得到了，却也是空，没有title，没有items，因为异步执行的原因！！！
                    client.close();
                })
                .catch(function(error){
                    sendErrMsg(res, UnknownError, error)
                    client.close();
                    return;
                })
            }) 
        } else if (reqType === 'pool'){
            console.log("POOL Searching ...")
            mongoClient.connect(mongoURL, function(err,client){
                // assert.equal(null,err);
                if(err){
                    sendErrMsg(res, FailToConnect, err)
                    client.close()
                    return
                }
                console.log(SuccessToConnect);
                let db = client.db('corpus')
                let col = db.collection('class_collection')
                // let value = reqParams.id
                out_data = {type:'list',content:{}}
                col.find().maxTimeMS(10000).toArray((err, colRes)=>{
                    if (err){
                        sendErrMsg(res, FailToFindItem, err)
                        client.close()
                        return
                    }
                    choosedItems = shuffleArray(colRes).slice(0,50)
                    out_data.content.items = []
                    // out_data.content.items = shuffleArray(result).slice(0,5)
                    for (choosedItem of choosedItems){
                        out_data.content.items.push({title:choosedItem.title, ref:{type:'class', params:{id:choosedItem.c_id}}})
                    }
                    console.log(SendRequest)
                    console.log(out_data)
                    res.status(200).send(out_data)//发现这个放在find之外，即使函数中得到了，却也是空，没有title，没有items，因为异步执行的原因！！！
                    client.close();
                })
            })
        } else {
            sendErrMsg(res, UnknownError, '[Search] No such type. Should be article/item/class/pool.');
        }
        requestSaved(req.query, {})
        // res.status(200).send({status:"200",type:"item",content:req.query.params.text});
    } else {
        sendErrMsg(res, UnknownError, '[Search] Should be HTTPS.')
    }
    return
});
app.post('/like', function(req, res){
    if(req.protocol === 'https'){
        let reqType = req.body.type
        let reqOpenId = req.body.open_id
        let reqParams = req.body.params
        console.log(GetRequest)
        console.log(req.body);
        mongoClient.connect(mongoURL, function(err, client){
            if(err){
                sendErrMsg(res, FailToConnect, err)
                client.close()
                return
            }
            console.log(SuccessToConnect);
            let db = client.db('corpus')
            let updateValue = {}
            let changedValue = {}
            if(reqType==='like')
            {
                updateValue = {$set:{like:1, time:Date.now()}}
                changedValue = {$inc:{like:1}}
            } else if (reqType === 'notlike'){
                updateValue = {$set:{like:0, time:Date.now()}}
                changedValue = {$inc:{like:-1}}
            } else {
                sendErrMsg(res, UnknownError, "[Like] No such type. Should be like/notlike.")
                client.close();
                return;
            }
            function updateLink(){
                return new Promise(function(resolve, reject){
                    let col = db.collection('like_collection')
                    let value = {open_id: reqOpenId, issue_id:reqParams.type+reqParams.id}
                    col.updateOne(value, updateValue, function(error, result){
                        if(error){
                            reject(error);
                            return;
                        }
                        if(result.modifiedCount!=0){
                            resolve(result.modifiedCount)
                            return;
                        } else {
                            reject(FailToFindItem)
                            return;
                        }
                    })
                })
            }
            function updateSum(){
                return new Promise(function(resolve, reject){
                    let colName = reqParams.type + '_collection'
                    let col = db.collection(colName)
                    let filterValue = {}
                    if (reqParams.type === 'article'){
                        filterValue = {a_id:reqParams.id}
                    } else if (reqParams.type === 'item')
                    {
                        filterValue = {i_id:reqParams.id}
                    } else {
                        reject("[Like-UpdateSum] No such type. Should be article/item.")
                        return;
                    }
                    col.updateOne(filterValue, changedValue, function(error, result){
                        if(error){
                            reject(error);
                            return;
                        }
                        if(result.modifiedCount!=0){
                            resolve(result.modifiedCount)
                            return;
                        } else {
                            reject(FailToFindItem)
                            return;
                        }
                        
                    })
                })

            }
            Promise.all([updateLink(), updateSum()])
            .then(function(values){
                console.log("[Like] Success.")
                console.log(values)
                res.status(200).send({success_msg:'OK'})
                client.close();
            }).catch(function(error){
                sendErrMsg(res, UnknownError, error);
                client.close();
                return;
            });
        })
        // connect 和 requestSaved是同步进行的。是一个promise。
        requestSaved(req.body, {})
    } else {
        sendErrMsg(res, UnknownError, "[Like] Should be HTTPS.")
    }
    return;
});
app.post('/dislike', function(req, res){
    if(req.protocol === 'https'){
        let reqType = req.body.type
        let reqOpenId = req.body.open_id
        let reqParams = req.body.params
        // let reqParams = JSON.parse(req.body.params)
        console.log(GetRequest)
        console.log(req.body);
        // console.log(reqType)
        // console.log(reqOpenId)
        // console.log(reqParams)
        mongoClient.connect(mongoURL, function(err, client){
            if(err){
                sendErrMsg(res, FailToConnect, err)
                client.close()
                return
            }
            console.log(SuccessToConnect);
            let db = client.db('corpus')
            let updateValue = {}
            let changedValue = {}
            if(reqType==='dislike')
            {
                updateValue = {$set:{dislike:1, time:Date.now()}}
                changedValue = {$inc:{dislike:1}}
            } else if (reqType === 'notdislike'){
                updateValue = {$set:{dislike:0, time:Date.now()}}
                changedValue = {$inc:{dislike:-1}}
            } else {
                sendErrMsg(res, UnknownError, "[Dislike] No such type. Should be dislike/notdislike.")
                client.close();
                return;
            }
            function updateLink(){
                return new Promise(function(resolve, reject){
                    let col = db.collection('like_collection')
                    let value = {open_id: reqOpenId, issue_id:reqParams.type+reqParams.id}
                    col.updateOne(value, updateValue, function(error, result){
                        if(error){
                            reject(error);
                            return;
                        }
                        if(result.modifiedCount!=0){
                            resolve(result.modifiedCount)
                            return;
                        } else {
                            reject(FailToFindItem)
                            return;
                        }
                    })
                })
            }
            function updateSum(){
                return new Promise(function(resolve, reject){
                    let colName = reqParams.type + '_collection'
                    let col = db.collection(colName)
                    let filterValue = {}
                    if (reqParams.type === 'article'){
                        filterValue = {a_id:reqParams.id}
                    } else if (reqParams.type === 'item')
                    {
                        filterValue = {i_id:reqParams.id}
                    } else {
                        reject("[Dislike-UpdateSum] No such type. Should be article/item.")
                        return;
                    }
                    col.updateOne(filterValue, changedValue, function(error, result){
                        if(error){
                            reject(error);
                            return;
                        }
                        if(result.modifiedCount!=0){
                            resolve(result.modifiedCount)
                            return;
                        } else {
                            reject(FailToFindItem)
                            return;
                        }
                        
                    })
                })

            }
            Promise.all([updateLink(), updateSum()])
            .then(function(values){
                console.log("[Dislike] Success.")
                console.log(values)
                res.status(200).send({success_msg:'OK'})
                client.close();
            }).catch(function(error){
                sendErrMsg(res, UnknownError, error);
                client.close();
                return;
            });
        })
        requestSaved(req.body, {})
    } else {
        sendErrMsg(res, UnknownError, '[Dislike] Should be HTTPS.')
    }
    return;
});


