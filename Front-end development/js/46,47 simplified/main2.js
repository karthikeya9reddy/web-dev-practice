// async/await

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







// examples in async / await functions