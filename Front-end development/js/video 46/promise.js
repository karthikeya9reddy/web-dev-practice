console.log("this is promises")


let prom1 = new Promise((resolve, reject) => {
    let a = Math.random()
    if (a < 0.5) {
        reject("no random number was genetated cus we are under maintaince ")
    }
    else {
        setTimeout(() => {
            console.log("yes i am done")
            resolve("harry")
        }, 3000);
    }
})

let prom2 = new Promise((resolve, reject) => {
    let a = Math.random()
    if (a < 0.5) {
        reject("no random number was genetated cus we are under maintaince 2 ")
    }
    else {
        setTimeout(() => {
            console.log("yes i am done 2")
            resolve("harry 2")
        }, 4000);
    }
})

// prom1.then((a) => {
//     console.log(a)
// }).catch((err)=>{
//     console.log(err)
// })

let prom3 = Promise.all([prom1, prom2])
prom3.then((a)=>{
    console.log(a)
}).catch((err)=>{
    console.log(err)
})