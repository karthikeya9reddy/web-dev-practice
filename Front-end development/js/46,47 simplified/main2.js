/* async/await

const myuser = {
    userlist: []
}

const mycoolfunction = async () => {
    const response = await fetch('https://jsonplaceholder.typicode.com/todos/1')
    const jsonuserdata = await response.json();
    return jsonuserdata;
}

const anotherfunc = async () =>{
    const data = await mycoolfunction();
    myuser.userlist = data;
    console.log(myuser.userlist); 
}
anotherfunc();
console.log(myuser.userlist); 
*/











/* worlflow examples in async / await functions


const getalluseremails  = async()=>{
    const response = await fetch("https://jsonplaceholder.typicode.com/users")
    const jsonuserdata = await response.json();
    
    const useremailarray = jsonuserdata.map(user =>{
        return user.email;
    })

    posttowebpage(useremailarray)
}
const posttowebpage = (data)=>{
    console.log(data) 
}
getalluseremails();*/












/*2nd parameter of fetch is a object
getting data from the server

const getdadjoke  = async()=>{
    const response = await fetch("https://icanhazdadjoke.com/", {
        method: "GET",
        headers: {
            Accept: "application/json"
        }
    })
    const jsonjokedata = await response.json();

    console.log(jsonjokedata);
}

getdadjoke();*/











/*the following fetch object shows only text in console

const getdadjoke  = async()=>{
    const response = await fetch("https://icanhazdadjoke.com/", {
        method: "GET",
        headers: {
            Accept: "text/plain"
        }
    })
    const textjokedata = await response.text();

    console.log(textjokedata);
}

getdadjoke();*/












/*posting data to the server 

const jokeobject = {
    id:"ozsPmORZvzd",
    joke:"A bartender broke up with her boyfriend, but he kept asking her for another shot.",
}

const postdata  = async(jokeobj)=>{
    const response = await fetch("https://httpbin.org/post", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
       body: JSON.stringify(jokeobj) 
    })
    const jsonresponse = await response.json();

    console.log(jsonresponse);
}

postdata(jokeobject);*/








// retrieving data with url parameters
const requestjoke = async (firstname, lastname) =>{

    const response = await fetch(`http://api.icndb.com/jokes/random?firstname=${firstname}&lastname=${lastname}&limitto=[nerdy]`)
    const jsonresponse = await response.json()

    console.log(jsonresponse.value);
}

requestjoke("clint", "eastwood");