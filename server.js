const express = require('express')
const dns = require('node:dns')
const axios = require('axios')

let mFbData = null
let mCountry = null
let mAllData = null
let mVIP = null

let mUpdate = new Date().getTime()+21600000

let app = express()

let BASE_URL = Buffer.from('aHR0cHM6Ly9qb2Itc2VydmVyLTA4OC1kZWZhdWx0LXJ0ZGIuZmlyZWJhc2Vpby5jb20vcmFpeWFuMDg4Lw==', 'base64').toString()

app.use(express.json())

app.listen(process.env.PORT || 3000, ()=> {
    console.log('Listening on port 3000')
})

app.get('/', async (req, res) => {
    res.end('Success')
})

app.get('/data', async (req, res) => {
    let mResult = await getFbData()

    if(mResult) {
        res.end(JSON.stringify(mResult))
    } else {
        res.end('{}')
    }
})

app.get('/ovpn', async (req, res) => {
    let type = null
    let key = null

    try {
        let query = req.query
        if (query && query.type) {
            type = query.type
        }
    } catch (error) {}

    try {
        let query = req.query
        if (query && query.key) {
            key = query.key
        }
    } catch (error) {}

    await readAllData()
    let mResult = await getOVPN(type, key)

    if(mResult) {
        res.end(JSON.stringify(mResult))
    } else {
        res.end('{}')
    }
})

app.get('/block', async (req, res) => {
    let type = null
    let key = null

    try {
        let query = req.query
        if (query && query.type) {
            type = query.type
        }
    } catch (error) {}

    try {
        let query = req.query
        if (query && query.key) {
            key = query.key
        }
    } catch (error) {}

    if (key != null && type != null) {
        await readAllData()
        await blockOVPN(type, key)
        res.end('Success') 
    } else {
        res.end('Error')
    }
})

readAllData()

async function readAllData() {
    let mSuccess = 0

    if (!mFbData || mUpdate < new Date().getTime()) {
        try {
            let response = await axios.get(BASE_URL+'ovpn/fb.json')
            let data = response.data

            if (data) {
                mFbData = data
                mSuccess++
            }
        } catch (error) {}
    }

    if (!mCountry || mUpdate < new Date().getTime()) {
        try {
            let response = await axios.get(BASE_URL+'ovpn/country.json')
            let data = response.data

            if (data) {
                mCountry = data
                mSuccess++
            }
        } catch (error) {}
    }

    if (!mAllData || mUpdate < new Date().getTime()) {
        try {
            let response = await axios.get(BASE_URL+'ovpn/ip.json')
            let data = response.data

            if (data) {
                mAllData = data
                mSuccess++
            }
        } catch (error) {}
    }

    if (!mVIP || mUpdate < new Date().getTime()) {
        try {
            let response = await axios.get(BASE_URL+'ovpn/vip.json')
            let data = response.data

            if (data) {
                mVIP = data
                mSuccess++
            }
        } catch (error) {}
    }

    if (mSuccess > 0) {
        mUpdate = new Date().getTime()+21600000
    }
}

async function getFbData() {
    let mResult = {}

    try {
        let response = await axios.get(BASE_URL+'facebook/config.json')
        let data = response.data

        if (data) {
            mResult['domain'] = data['domain']
            mResult['female'] = data['female']
            mResult['domain_type'] = data['type']

            let type = data['name']

            response = await axios.get(BASE_URL+'facebook/name/'+ type +'.json?orderBy=%22$key%22&limitToLast=1')
            data = response.data

            if (data) {
                let key = Object.keys(data)[0]
                mResult['name'] = data[key]
                mResult['type'] = type

                try {
                    await axios.delete(BASE_URL+'facebook/name/'+ type +'/'+key+'.json')
                } catch (error) {}
            }
        }
    } catch (error) {}

    return mResult
}

async function getOVPN(type, key) {
    try {
        if (key) {
            let prev = mAllData[key][type]
            mAllData[key][type] = prev+1

            await axios.patch(BASE_URL+'ovpn/ip/'+key+'.json', '{"'+type+'":'+(prev+1)+'}', {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
        }
    } catch (error) {}

    let load = mFbData['load']
    let code = mCountry[load]

    let mResult = null
    
    for (let i = 0; i < mCountry.length-1; i++) {

        let mData = []

        for (let [key, value] of Object.entries(mAllData)) {
            if (value['active'] < parseInt(new Date().getTime()/1000)) {
                if (value['code'] == code) {
                    let block = value['block']
                    try {
                        if (value['offline'] != undefined && value['offline'] != null) {
                            block += parseInt(value['offline'])
                        }
                    } catch (error) {}

                    try {
                        if (value['error'] != undefined && value['error'] != null) {
                            block += parseInt(value['error'])
                        }
                    } catch (error) {}

                    mData.push({
                        key: key,
                        block: block
                    })
                }
            }
        }

        if (mData.length > 0) {
            var sorted = mData.sort(function(a, b) {
                return (a.block > b.block) ? 1 : ((b.block > a.block) ? -1 : 0)
            })

            if (sorted[0]['block'] < mFbData['limit']) {
                try {
                    let key = sorted[0]['key']
                    let value = mAllData[key]
                    
                    if (value['type'] == 'free') {
                        let responce = await axios.get(BASE_URL+'ovpn/free/'+key+'.json')
                        let data = responce.data

                        if (data) {
                            mResult = {
                                key: key,
                                code: value['code'],
                                country: value['country'],
                                config: data['config'],
                                user: data['user'],
                                pass: data['pass']
                            }
                        }
                    } else {
                        let ip = await getIpAdress(key.replace(/[_]/g, '.'))
                        if (ip == null) {
                            ip = value['ip']
                        }

                        mResult = {
                            key: key,
                            code: value['code'],
                            country: value['country'],
                            config: mVIP['config'].replace('remote default', 'remote '+ip+' 443'),
                            user: mVIP['user'],
                            pass: mVIP['pass']
                        }
                    }
                } catch (error) {}

                break
            } else {
                load++
                if (load >= mCountry.length) {
                    load = 0
                }
                code = mCountry[load]
            }
        } else {
            load++
            if (load >= mCountry.length) {
                load = 0
            }
            code = mCountry[load]
        }
    }
    
    try {
        if (mResult) {
            let active = parseInt(new Date().getTime()/1000)+86400

            mAllData[mResult['key']]['active'] = active

            await axios.patch(BASE_URL+'ovpn/ip/'+mResult['key']+'.json', JSON.stringify({ active:active }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
        }
    } catch (error) {}

    try {
        mFbData['load'] = load+1

        await axios.patch(BASE_URL+'ovpn/fb.json', JSON.stringify({ load:load+1 }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    } catch (error) {}

    return mResult
}

async function blockOVPN(type, key) {
    try {
        let prev = mAllData[key][type]
        mAllData[key][type] = prev+1

        await axios.patch(BASE_URL+'ovpn/ip/'+key+'.json', '{"'+type+'":'+(prev+1)+'}', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    } catch (error) {}
}

function getIpAdress(host) {
    return new Promise(function(resolve) {
        dns.lookup(host, (err, addresses, family) => { 
            if (err) {
                resolve(null)
            } else if (addresses) {
                resolve(addresses)
            } else {
                resolve(null)
            }
        })
    })
}
