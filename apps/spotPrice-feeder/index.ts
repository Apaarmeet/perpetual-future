import WebSocket from "ws"


const ws = new WebSocket("wss://stream.binance.com:9443/ws/solusdt@ticker",)

ws.on('error', console.error);


ws.on('message', (data: any) => {
    const msg = data.toString('utf8')
    const price  = JSON.parse(msg)
    console.log(price.c)
})

