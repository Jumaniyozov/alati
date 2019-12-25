const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/alati', {useUnifiedTopology: true, useNewUrlParser: true});


class DBHandler {
    static mealSchema = new mongoose.Schema({
        name: {
            type: String,
            unique: true,
            required: true
        },
        price: {
            type: String,
            required: true
        }
    });

    static userSchema = new mongoose.Schema({
        name: {
            type: String,
            required: true
        },
        userID: {
            type: String,
            unique: true,
            required: true,
        }
    });

    static sessionSchema = new mongoose.Schema({
        key: {
            type: String,
            required: true
        },
        data: {
            type: Map,
            required: false
        }
    });

    static cartSchema = new mongoose.Schema({
        userID: {
            type: String,
            required: true,
            unique:true
        },
        meals: {
            type: mongoose.Mixed,
            static: false
        }
    });

    static Sessions = mongoose.model('Sessions', DBHandler.sessionSchema);
    static User = mongoose.model('User', DBHandler.userSchema);
    static Meal = mongoose.model('Meal', DBHandler.mealSchema);
    static Cart = mongoose.model('Cart', DBHandler.cartSchema);

    static async insertMeal(name, price) {
        const newMeal = await new DBHandler.Meal({name: name, price: price});
        newMeal.save();
    }

    static async deleteMeal(name) {
        await DBHandler.Meal.deleteOne({name: name}, (err) => {
            if (err) return handleError(err);
            // deleted at most one tank document
        });
    }

    static async getMeals() {
        const data = await DBHandler.Meal.find({}, {_id: 0, __v: 0});
        const res = {};
        data.forEach(item => {
            res[`${item.name}`] = item.price;
        });
        return res;
    }

    static async getOneMeal(name) {
        return await DBHandler.Meal.findOne({name: name}, {_id: 0, __v: 0});
    }

    static async getAllUsers() {
        return await DBHandler.Sessions.find({}, {_id: 0, __v: 0, data: 0});
    }

    static async getAllAdminUsers() {
        const data = [];
        const users = await DBHandler.User.find({}, {_id: 0, __v: 0});
        users.forEach(user => data.push([`${user.name} (ID: ${user.userID})`]));
        return data;
    }

    static async getCart(id) {
        return await DBHandler.Cart.findOne({userID: id}, {_id: 0, __v: 0});
    }

    static async saveToCart(id, pair) {
        const cart = await new DBHandler.Cart({userID: id, meals: pair});
        cart.save();
    }

    static async deleteFromCart() {
        await DBHandler.Cart.deleteOne({userID: id})
    }

    static async clearCart(id) {
        await DBHandler.Cart.deleteOne({userID: id});
    }

    static async updateCart(id, pair) {
        await DBHandler.Cart.updateOne({userID: id}, {$set: {meals: pair}});
    }

    static async createAdmin(name, id) {
        const newUser = await new DBHandler.User({name: name, userID: id});
        newUser.save();
    }

    static async deleteAdmin(id) {
        await DBHandler.User.deleteOne({userID: id}, (err) => {
            if (err) return handleError(err);
            // deleted at most one tank document
        });
    }

    static async getAdminUsers() {
        return await DBHandler.User.find({}).exec()
            .then(arr => {
                    const val = [];
                    arr.forEach(item => {
                        val.push(item.userID);
                    });
                    return val;
                }
            )
    }
}

DBHandler.getMeals();

module.exports = DBHandler;

// const menu_markup = [['Манты с говядиной', 'Манты с говядиной и картошкой'],
//     [ 'Самса с картошкой', 'Самса с говядиной'],
//     ['Вареники с грибами', 'Вареники с картошкой'],
//     ['Котлеты с говядиной', 'Котлеты с курицей'],
//     ['Пельмени с говядиной', 'Сырники'],
//     ['Долма', 'Голубцы'],
//     ['Перец фаршированный', 'Тефтели'],
//     ['Фрикадельки', 'Мясной пирог'],
//     ['Бельгийские вафли с жемчужным сахаром'],
// ];
// DBHandler.deleteMeal('Beef');
// DBHandler.insertMeal('Beef', 25000);
// DBHandler.createAdmin('Islom', '48828613');
// DBHandler.deleteAdmin('48828613');