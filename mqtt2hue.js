let fetch = require('node-fetch')
let fs = require('fs')
let os = require('os')
let mqtt = require('async-mqtt')
let debug = false
let state = null // complete state object received from  hue bridge
let subscribed = {} 
let client = null // mqtt client

let config = { mqttUrl: 'mqtt://test.mosquitto.org', hueUrl: 'http://MYBRIDGE/api/MYKEY' }

async function lightswitch (n, newState) {
  if (state.lights[n].state.on === newState) return
  const res=await fetch(config.hueUrl + '/lights/' + n + '/state',{ method:"PUT", body: JSON.stringify({ 'on': newState }) })
  state.lights[n].state.on = newState
}
async function lightbri (n, bri) {
  await fetch(config.hueUrl + '/lights/' + n + '/state',{ method:"PUT", body: JSON.stringify({ 'bri': bri })})
}

function lighton (t) {
  return lightswitch(t, true)
}

function lightoff (t) {
  return lightswitch(t, false)
}

async function updateState () {
  if (debug) console.log(JSON.stringify(state,null,2))
  try {
    await updateStateInternal()
  } catch (e)
  {
    console.log(e)
  }
  setTimeout(updateState, 10000)
}

async function updateStateInternal () {
  let oldState = state
  state = await readState()
  let k = Object.keys(state.lights)
  if (!client) return
  for (let n of k) {
    if(state.lights[n].type==="Configuration tool") continue;
    let topic = 'light/' + n
    if (subscribed[topic] !== n) {
      subscribed[topic] = n
      await client.subscribe(topic)
      await client.subscribe(topic + '/bri')
      await client.publish(topic + '/name',state.lights[n].name,{retain:true})
    }
    if (oldState === null || state.lights[n].state.on !== oldState.lights[n].state.on) {
      await client.publish(topic, state.lights[n].state.on ? '1' : '0',{retain:true})
    }
  }
}

async function readState () {
  const res=await fetch( config.hueUrl )
  return res.json()
}

async function main () {
  try {
    config = JSON.parse(fs.readFileSync(os.homedir() + '/.mqtt2hue.json'))
  } catch (e) {
    // use defaults
  }
  client = mqtt.connect(config.mqttUrl, config)
  let first = true
  client.on('connect', async function () {
    subscribed={}
    if (first) updateState()
    first = false
  })
  client.on('message', function (topic, raw) {
    let message = raw.toString()
    let [light, nr, bri] = topic.split('/')
    if (bri) {
      lightbri(nr, message / 100 * 255)
    } else {
      if (message === '1') {
        lighton(nr)
      } else
      if (message === '0') {
        lightoff(nr)
      }
    }
  })
}

main().catch(e => console.log(e))
