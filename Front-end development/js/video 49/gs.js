class user{
    constructor(name){
        //invokes the setter
        this.name = name;
    }
    get name() {
        return this._name;
    }
    
    set name(value){
        if(value.length < 4){
            console.log("name is too short")
            return;
        }
        this._name  = value;
    }
}


let User = new user("john")
console.log(User.name); //john

User = new user(""); // name is too short 