import { ORDERBOOKS, type depth, type getDepthInput } from "../exchangeStore";



export function handleGetDepth(payload : Record<string, unknown>) {

    const {symbol, limit} = payload as unknown as getDepthInput


    const orderbook = ORDERBOOKS.get(symbol)

    if(!orderbook) throw new Error("there is no resting orders")
    const sortedAskorders = [...orderbook.asks.keys()].sort((a,b) => a-b) // sell

    const sortedBidsorders = [...orderbook.bids.keys()].sort((a,b) => b-a) // buy

    let bids:depth[] = []
    let asks:depth[] = []

    for (let i = 0; i< limit; i++){
        const levelPrice = sortedBidsorders[i];
        if(levelPrice === undefined) continue

        const orders = orderbook.bids.get(levelPrice) || []
        const qty = orders?.reduce((sum, restingOrder)=>{
            return sum + (restingOrder.qty-restingOrder.filledQty)
        },0)
        
        if(qty > 0){
            bids.push({
                price: levelPrice,
                qty
            })
        } else {
            throw new Error ("there no qt in this order")
        }

    }

    for (let i = 0; i< limit; i++){
        const levelPrice = sortedAskorders[i];
        if(!levelPrice) continue

        const orders = orderbook.asks.get(levelPrice) || []
        const qty = orders?.reduce((sum, restingOrder)=>{
            return sum + (restingOrder.qty-restingOrder.filledQty)
        },0)
        
        if(qty > 0){
            asks.push({
                price: levelPrice,
                qty
            })
        } else {
            throw new Error ("there no qty in this order")
        }

    }

    return {
        symbol,
        bids,
        asks,
        timestamp: Date.now()
    }


}