console.log("welcome to exercise 10 array version")

let random1 = Math.random()
let random2 = Math.random()
let random3 = Math.random()

let adjectiveroll = Math.floor(random1 * 3)
let shoproll = Math.floor(random2 * 3)
let wordroll = Math.floor(random3 * 3)

let adj = ["crazy","amazing","fire" ]

let shop = ["engine","foods", "garments"]

let word = ["bros","limited","hub"]

let finaladj = adj[adjectiveroll]
let finalshop = shop[shoproll]
let finalword = word[wordroll]

console.log(`The business name generated is "${finaladj} ${finalshop} ${finalword}"`)