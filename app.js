// Dependencies (Libraries)
require('dotenv').config({path: __dirname + '/.env'});
const Telegraf = require('telegraf'),
    Extra = require('telegraf/extra'),
    mongoose = require('mongoose'),
    Stage = require('telegraf/stage'),
    Scene = require('telegraf/scenes/base'),
    WizardScene = require('telegraf/scenes/wizard'),
    Markup = require('telegraf/markup'),
    {TelegrafMongoSession} = require('telegraf-session-mongodb'),
    DBHelper = require('./helpers/db_helper'),
    ViewHelper = require('./helpers/markup_helper'),
    LocalSession = require('telegraf-session-local');

// Initialization

bot = new Telegraf(process.env.USER_BOT_TOKEN);
mongoose.connect('mongodb://localhost/alati', {useUnifiedTopology: true, useNewUrlParser: true});
TelegrafMongoSession.setup(bot, 'mongodb://localhost/alati');
const localSession = new LocalSession({
    // Database name/path, where sessions will be located (default: 'sessions.json')
    database: 'localDB.json',
    // Name of session property object in Telegraf Context (default: 'session')
    property: 'session',
    // Type of lowdb storage (default: 'storageFileSync')
    storage: LocalSession.storageFileAsync,
    // Format of storage/database (default: JSON.stringify / JSON.parse)
    format: {
        serialize: (obj) => JSON.stringify(obj, null, 2), // null & 2 for pretty-formatted JSON
        deserialize: (str) => JSON.parse(str),
    },
    // We will use `messages` array in our database to store user messages using exported lowdb instance from LocalSession via Telegraf Context
    state: {messages: []}
});

bot.use(localSession.middleware());

// Scenes
const entranceScene = new Scene('entrance');
entranceScene.enter((ctx) => ctx.reply('Выберите метод входа', Extra.markup(markup => {
    return markup.keyboard(['Зайти как администратор', 'Зайти как пользователь']).resize();
})));
entranceScene.hears(/Зайти как администратор/, ctx => {
    return ctx.scene.enter('admin');
});
entranceScene.hears(/Зайти как пользователь/, ctx => {
    return ctx.scene.enter('user');
});

const adminScene = new Scene('admin');
adminScene.enter(ctx => ctx.reply('Админь панель', Extra.markup(markup => {
    return markup.keyboard(['🛠️ Настроить Меню', '✉️ Отправить сообщение', '👥 Настройка пользователей', '📊 Статистика']).resize();
})));
adminScene.command('start', ctx => ctx.scene.enter('entrance'));
adminScene.hears(/🛠️ Настроить Меню/i, ctx => ctx.scene.enter('menuSetup'));
adminScene.hears(/✉️ Отправить сообщение/i, ctx => ctx.scene.enter('message'));
adminScene.hears(/👥 Настройка пользователей/i, ctx => ctx.scene.enter('userSetup'));
adminScene.hears(/📊 Статистика/i, ctx => ctx.reply('Статистика'));

const userScene = new Scene('user');
userScene.enter(ctx => ctx.reply(`Привет ${ctx.from.first_name}`, Extra.markup(markup => {
    return markup.keyboard(['🥟 Меню', '🛒 Корзина', '🚚 Оформить заказ', '📇 Контакты', '⭐ Оставить отзыв']).resize()
})));
userScene.hears(/🥟 Меню/i, ctx => ctx.scene.enter('menu'));
userScene.hears(/🛒 Корзина/i, ctx => ctx.scene.enter('cart'));
userScene.hears(/🚚 Оформить заказ/i, ctx => ctx.reply('Оформление'));
userScene.hears(/📇 Контакты/i, ctx => ctx.reply('Контакты'));
userScene.hears(/⭐ Оставить отзыв/i, ctx => ctx.reply('Отзыв'));
userScene.command('start', async (ctx) => {
    const vals = [];
    const users = await DBHelper.User.find({}, {_id: 0, __v: 0});
    users.forEach(item => vals.push(item.userID));
    if (vals.includes((ctx.from.id).toString())) {
        return ctx.scene.enter('entrance');
    }
});


const menuSetupScene = new Scene('menuSetup');
menuSetupScene.enter(async ctx => {
    const mealsView = await ViewHelper.getMeals();
    ctx.reply('Настройки', Extra.markup(markup => {
        return markup.keyboard([['⬅️ Назад'],
            ['➕ Добавить блюдо', '➖ Удалить блюдо'], ...mealsView]).resize();
    }))
});
menuSetupScene.hears(/➕ Добавить блюдо/i, ctx => ctx.scene.enter('addMeal'));
menuSetupScene.hears(/➖ Удалить блюдо/i, ctx => ctx.scene.enter('deleteMeal'));
menuSetupScene.hears(/⬅️ Назад/i, ctx => ctx.scene.enter('admin'));

const addMeal = new WizardScene('addMeal',
    (ctx) => {
        ctx.reply('Пожалуйста введите имя блюда', Markup.removeKeyboard().extra());
        ctx['session'].meal = {};
        return ctx.wizard.next()
    },
    async (ctx) => {
        // const name = await DBHelper.getMeals();
        ctx.reply('Пожалуйста введи сумму');
        ctx['session'].meal.name = ctx.message.text;
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.reply('Сохранено');
        ctx['session'].meal.price = ctx.message.text;
        DBHelper.insertMeal(`${ctx['session'].meal.name}`, `${ctx['session'].meal.price}`);
        console.log(ctx['session'].meal);
        ctx['session'].meal = {};
        return ctx.scene.enter('admin');
    }
);

const deleteMeal = new WizardScene('deleteMeal',
    (ctx) => {
        ctx.reply('Пожалуйста введите имя блюда', Markup.removeKeyboard().extra());
        return ctx.wizard.next()
    },
    (ctx) => {
        DBHelper.deleteMeal(`${ctx.message.text}`);
        ctx.reply('Удалено');
        return ctx.scene.enter('admin');
    }
);

const messageScene = new Scene('message');
messageScene.enter(ctx => ctx.scene.enter('messageSetup'));

const messageSetup = new WizardScene('messageSetup',
    (ctx) => {
        ctx.reply(`Пожалуйста настройте сообщение: Загрузите фото`, Markup.removeKeyboard().extra());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.photo) {
            ctx['session'].message.photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            await ctx.reply('Пожалуйста введите Описание сообщения?');
            ctx.wizard.next();
        } else {
            ctx.reply('Пожалуйста загрузите фото');
            ctx.wizard.selectSetup(0);
        }
    }, async (ctx) => {
        const users = await DBHelper.getAllUsers();
        ctx['session'].message.caption = ctx.message.text;
        ctx.replyWithPhoto(ctx['session'].message.photo, {caption: ctx['session'].message.caption});
        ctx['session'].message = {};
        ctx.scene.enter('admin');
    });

const userSetupScene = new Scene('userSetup');
userSetupScene.enter(async ctx => {
    const users = await DBHelper.getAllAdminUsers();
    console.log(users);
    ctx.reply('Настройка пользователей',
        Extra.markup(markup => markup.keyboard([['⬅️ Назад'],
            ['➕ Добавить администратора', '➖ Удалить администратора'], ...users])));
});
userSetupScene.hears(/⬅️ Назад/i, ctx => ctx.scene.enter('admin'));
userSetupScene.hears(/➕ Добавить администратора/i, ctx => ctx.scene.enter('adminAdd'));
userSetupScene.hears(/➖ Удалить администратора/i, ctx => ctx.scene.enter('adminDelete'));

const adminAdd = new WizardScene('adminAdd',
    (ctx) => {
        ctx['session'].admin = {};
        ctx.reply(`Пожалуйста введите имя пользователя`, Markup.removeKeyboard().extra());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx['session'].admin.name = ctx.message.text;
        ctx.reply('Пожалуйста введите ID пользователя');
        ctx.wizard.next();
    }, (ctx) => {
        ctx['session'].admin.id = ctx.message.text;
        DBHelper.createAdmin(ctx['session'].admin.name, ctx['session'].admin.id);
        ctx.reply('Пользователь был добавлен');
        ctx.scene.enter('admin');
    });

const adminDelete = new WizardScene('adminDelete',
    (ctx) => {
        ctx.reply(`Пожалуйста введите ID пользователя`);
        return ctx.wizard.next();
    },
    (ctx) => {
        DBHelper.deleteAdmin(ctx.message.text);
        ctx.reply('Пользователь был удален');
        ctx.scene.enter('admin');
    });

const menuScene = new Scene('menu');
menuScene.enter(async ctx => {
    const meals = await DBHelper.getMeals();
    const data = [];
    Object.keys(meals).forEach(meal => data.push([meal]));
    ctx.reply('Меню', Extra.markup(markup => {
        return markup.keyboard([['⬅️ Назад'], ...data]).resize();
    }))
});
menuScene.hears(/⬅️ Назад/i, ctx => ctx.scene.enter('user'));
menuScene.on('message', async ctx => {
        ctx['session'].currentMeal = {};
        const meals = await DBHelper.getMeals();
        const chosenMeal = ctx.message.text;
        if (Object.keys(meals).includes(chosenMeal)) {
            const meal = await DBHelper.getOneMeal(chosenMeal);
            ctx['session'].currentMeal.name = meal.name;
            ctx['session'].currentMeal.price = meal.price;
            return ctx.scene.enter('chooseQuantity');
        } else {
            return ctx.reply('Извините этого блюдо нет в меню');
        }
    }
);

const chooseQuantity = new Scene('chooseQuantity');
chooseQuantity.enter(ctx => {
    return ctx.replyWithHTML(`<b>Пожалуйста введите</b> или <b>Выберите количество</b>`,
        Markup.keyboard([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['⬅️ Назад']]).extra())
});
chooseQuantity.hears(/⬅️ Назад/i, ctx => ctx.scene.enter('menu'));
chooseQuantity.on('message', async ctx => {
    try {
        ctx['session'].currentMeal.quantity = parseInt(ctx.message.text);
        if (typeof (ctx['session'].currentMeal.quantity) === 'number') {
            const cart = await DBHelper.getCart(ctx.from.id.toString());
            if (cart) {
                const data = cart.meals;
                const names = [];
                data.forEach(item => names.push(item.name));
                if (names.includes(ctx['session'].currentMeal.name)) {
                    const index = data.findIndex(item => item.name === ctx['session'].currentMeal.name);
                    data[index] = {
                        "name": ctx['session'].currentMeal.name,
                        "price": ctx['session'].currentMeal.price,
                        "quantity": ctx['session'].currentMeal.quantity
                    };

                } else {
                    data.push({
                        "name": ctx['session'].currentMeal.name,
                        "price": ctx['session'].currentMeal.price,
                        "quantity": ctx['session'].currentMeal.quantity
                    });
                }
                let total = 0;
                let message = `<b>Корзина:</b>\n\n`;
                data.forEach(item => {
                        total += item.price * item.quantity;
                        message += `<i>${item.name}</i> : ` + `${item.quantity} x ${item.price} = ${item.quantity * item.price}\n`;
                    }
                );
                message += `\n<b>Итого</b>: ${total}`;
                ctx.replyWithHTML(message);
                await DBHelper.updateCart(ctx.from.id.toString(), data);
                return ctx.scene.enter('menu');
            } else {
                await DBHelper.saveToCart(ctx.from.id.toString(), [{
                    "name": ctx['session'].currentMeal.name,
                    "price": ctx['session'].currentMeal.price,
                    "quantity": ctx['session'].currentMeal.quantity
                }]);
                const total = ctx['session'].currentMeal.price * ctx['session'].currentMeal.quantity;
                const message = '<b>Корзина:</b>' + '\n\n' + `${ctx['session'].currentMeal.name}\n` +
                    `${ctx['session'].currentMeal.quantity} x ${ctx['session'].currentMeal.price} = ${total}\n\n`
                    + `<b>Итого:</b> ${total}`;
                ctx.replyWithHTML(message);
                return ctx.scene.enter('menu');
            }
        } else {
            ctx.reply('Пожалуйста введите количество в цифрах');
            return ctx.scene.enter('menu');
        }
    } catch (e) {
        console.log(e);
        ctx.reply('Пожалуйста введите количество в цифрах');
        return ctx.scene.enter('menu');
    }
});

const cartScene = new Scene('cart');
cartScene.enter(async ctx => {
    const cart = await DBHelper.getCart(ctx.from.id);
    const data = [];
    if (cart) {
        cart.meals.forEach(meal => data.push([`❌ ${meal.name}`]));
        return ctx.reply('Корзина', Markup.keyboard([['⬅️ Назад', '🔄 Очистить'], ...data]).resize().extra());
    } else {
        ctx.scene.enter('user');
        return ctx.reply('Корзина пуста');
    }
});
cartScene.hears(/⬅️ Назад/i, ctx => ctx.scene.enter('user'));
cartScene.hears(/🔄 Очистить/i, ctx => {
    DBHelper.clearCart(ctx.from.id);
    ctx.reply('корзина очищена');
    return ctx.scene.enter('user');
});
cartScene.on('message', async ctx => {
    const vals = ctx.message.text.split('❌');
    const meals = await DBHelper.getMeals();
    if (vals.length > 1 && Object.keys(meals).includes(vals[1].trim())) {
        const data = (await DBHelper.getCart(ctx.from.id.toString())).meals;
        const index = data.findIndex(item => item.name === vals[1].trim());
        data.splice(index, 1);
        await DBHelper.updateCart(ctx.from.id.toString(), data);
        let message = '';
        let total = 0;
        data.forEach(item => {
            total += item.price * item.quantity;
            message += `<b>Корзина:</b>\n\n` +
                `${item.name}: ` + `${item.quantity} x ${item.price} = ${item.price * item.quantity}\n`
        });
        message += `\n<b>Итого:</b> ${total}`;
        ctx.replyWithHTML(message);
        ctx.scene.enter('cart');
    } else {
        ctx.reply('Этого блюдо нет в корзине');
    }
});

//
// const orderScene = new Scene('order');
// orderScene.enter();
// orderScene.leave();
// orderScene.hears();
//
// const ratingScene = new Scene('rating');
// ratingScene.enter();
// ratingScene.leave();
// orderScene.hears();
//
//
//
//
// const statisticsScene = new Scene('statistics');
// statisticsScene.enter();
// statisticsScene.leave();
// statisticsScene.hears();


const stage = new Stage([entranceScene, adminScene, userScene, menuSetupScene, addMeal,
    deleteMeal, messageScene, messageSetup, userSetupScene, adminAdd, adminDelete, menuScene,
    chooseQuantity, cartScene]);
bot.use(stage.middleware());


// App Logic
bot.start(async (ctx) => {
    const vals = [];
    const users = await DBHelper.User.find({}, {_id: 0, __v: 0});
    users.forEach(item => vals.push(item.userID));
    ctx.reply(`Здравствуйте ${ctx.from.first_name}`);
    if (vals.includes((ctx.from.id).toString())) {
        ctx.scene.enter('entrance');
    }
    // USER PANEL
    else {
        ctx.scene.enter('user');
    }
});
// ADMIN BUSINESS LOGIC
// if (true) {
//     console.log('Inside Admin');
//     bot.hears(/🥟? ?Настроить Меню/i, async ctx => await ctx.reply('Yeak', Extra.markdown().markup(markup => {
//             return markup.keyboard(['➕ Добавить блюдо', '➖ Удалить блюдо']).resize();
//         }
//     )));
// }
// //USER BUSINESS LOGIC
// else {
//     console.log('Inside User');
//     bot.hears(/🥟? ?Меню/, async ctx => await ctx.replyWithPhoto('https://telegra.ph/menu-12-19',
//         Extra.markup((m) => m.resize().keyboard(menu_markup.concat([['🔙 Назад']])))
//     ));
// }


bot.startPolling();