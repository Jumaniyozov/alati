const DBHelper = require('./db_helper');

class Views {
    static async getMeals(){
        const meals = await DBHelper.getMeals();
        const res = [];
        Object.keys(meals).forEach(item => res.push([item]));
        return res;
    }
}

module.exports = Views;
// Views.getMeals().then(data=>console.log(data));