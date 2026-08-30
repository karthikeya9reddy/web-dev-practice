console.log("welcome to exercise 10")

let random1 = Math.random()
let random2 = Math.random()
let random3 = Math.random()

let adjectiveroll = Math.floor(random1 * 3)
let shoproll = Math.floor(random2 * 3)
let wordroll = Math.floor(random3 * 3)

let adj1 = "crazy"
let adj2 = "amazing"
let adj3 = "fire"

let shop1 = "engine"
let shop2 = "foods"
let shop3 = "garments"

let word1 = "bros"
let word2 = "limited"
let word3 = "hub"

let finaladj
let finalshop
let finalword

if (adjectiveroll == 0){
    finaladj = adj1
}
else if(adjectiveroll == 1){
    finaladj = adj2
}
else if(adjectiveroll == 2){
    finaladj = adj3
}

if (shoproll == 0){
    finalshop = shop1
}
else if(shoproll == 1){
    finalshop = shop2
}
else if(shoproll == 2){
    finalshop = shop3
}

if (wordroll == 0){
    finalword = word1
}
else if(wordroll == 1){
    finalword = word2
}
else if(wordroll == 2){
    finalword = word3
}

console.log(`The business name generated is "${finaladj} ${finalshop} ${finalword}"`)