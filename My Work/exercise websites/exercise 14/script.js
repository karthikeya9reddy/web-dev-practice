/* Exercise 1 — Callback: Restaurant order 🍔

function orderfood(callback){
    console.log("ordering food...");

    setTimeout(() => {
        console.log("food got deliveried!")
        callback();
    }, 5000);
}

function eating(){
    console.log("eating food!")
}

orderfood(eating);*/




/*Exercise 2 — Callback hell

function orderfood(callback){
    console.log("ordering food...");

    setTimeout(() => {
        console.log("food got deliveried!")
        callback();
    }, 5000);
}

function eating(callback2){
    console.log("eating food!")

    setTimeout(() => {
        console.log("finished eating time to wash!!")
        callback2()
    }, 3000);
}

function washdishes(){
    console.log("finished washing everything")
}

orderfood(()=>{
    eating(()=>{
        washdishes()
    })
})*/




// Exercise 3 — Promise version

function orderfood(){
    return new Promise((resolve, reject) => {
        const ordered = ture;
        if (ordered) {
            resolve("your food is ordered ")
        }
        else{
            reject("your food was not ordered")
        }
    })
}

orderfood()
.then(value =>{
     console.log(value)
}).catch(err =>{
    console.log(err)
})