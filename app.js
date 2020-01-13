// PACKAGES SETUP
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const socket = require("socket.io");
const cookieParser = require('cookie-parser');
const passportSocketIo = require("passport.socketio");
const log = require('simple-node-logger').createSimpleLogger('server.log');
const request = require('request');
const { uuid } = require('uuidv4');
require('dotenv').config();

// LOAD ROUTES
const authRoutes = require("./routes/auth-routes");
const passportSetup = require("./config/passport-setup");
const profileRoutes = require("./routes/profile");
const mazzo = require("./models/mazzo");
const User = require('./models/user');
const middleware = require("./middleware");

// SET VIEW ENGINE EJS
app.set("view engine", "ejs");

// USE COOKIE PARSER
app.use(cookieParser(process.env.cooKey));

// CONNECT MONGODB URI
mongoose.connect(process.env.mongoDBURI, { useNewUrlParser: true, useUnifiedTopology: true }, function(){
    console.log("Database connected!");
});

mongoStore = new MongoStore({
    url: process.env.mongoDBURI,
    ttl: 24*60*60
});

// SETUP EXPRESS SESSION AND CONNECT MONGO
app.use(session({
    key: "connect.sid",
    secret: process.env.cooKey,
    resave: false,
    saveUninitialized: true,
    cookie: {},
    store: mongoStore
}));

// CONNECT FLASH MESSAGES
app.use(flash());

// INITIALIZE PASSPORT
app.use(passport.initialize());
app.use(passport.session());

// GLOBAL
app.use(function(req, res, next){
    res.locals.utente = req.user;
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
 });

// AUTH ROUTES
app.use("/autenticazione", authRoutes);

// PROFILE ROUTES
app.use("/profilo", profileRoutes);

// MONGOOSE SETUP
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

// BODY PARSER SETUP
app.use(bodyParser.urlencoded({extended: false }));
app.use(bodyParser.json());

// SET PUBLIC FOLDER
app.use(express.static(__dirname + "/public"));

// METHOD OVERRIDE SETUP
app.use(methodOverride("_method"));

// RESTful Routing
app.get("/", function(req, res){
    res.render("home");
});

function getCats(res){
    var catCount = 5;
    var catArray = [];
    return new Promise(function (resolve, reject){
        for (var i = 0; i < 5; i++){
            request({
                url: 'https://api.thecatapi.com/v1/images/search',
                headers: {
                    'x-api-key': process.env.catKey
                }
            }, function(error, response, body){
                if(error){
                    log.error("Errore nella ricerca di un gatto:");
                    reject(error);
                    res.redirect("/");
                } else {
                    catCount--;
                    catArray.push(JSON.parse(body)[0]["url"]);
                    if(catCount <= 0){
                        resolve(catArray);
                    }
                }
            });
        };
    });
};

app.get("/errore", function(req, res){
    getCats(res).then(function(deezCats){
        res.render("errore", {catArray: deezCats});
    }).catch(function(error){
        log.error("Errore nella promessa di un gatto:");
        console.log(error);
        res.redirect("/");
    });
});

app.get("/rimosso", function(req, res){
    getCats(res).then(function(deezCats){
        res.render("rimosso", {catArray: deezCats});
    }).catch(function(error){
        log.error("Errore nella promessa di un gatto:");
        console.log(error);
        res.redirect("/");
    });
});

app.get("/informazioni", function(req, res){
    res.render("info")
});

app.get("/nuovapartita", middleware.controllaAccesso, function(req, res){
    res.render("newGame");
});

app.post("/nuovapartita", middleware.controllaAccesso, function(req, res){
    res.redirect("/dubito");
});

app.get("/dubito", middleware.controllaAccesso, function(req, res){
    res.render("partita");
});

app.put("/profilo/:id", middleware.controllaAccesso, function(req, res){
    // Trova e aggiorna nickname, se valido
    if(req.body.nickname.length >= 5 && req.body.nickname.length <= 15 && /^\w+$/.test(req.body.nickname)){
        User.find({}, function(err, allUsers){
            if(err){
                log.error(err.toString());
                req.flash("error", err);
                res.redirect("/profilo");
            } else {
                var sameNick = false;
                for(var i = 0; i < allUsers.length; i++){
                    if(allUsers[i].nickname == req.body.nickname){
                        req.flash("error", "Il nickname " + req.body.nickname + " è già in uso");
                        res.redirect("/profilo");
                        sameNick = true;
                        break;
                    }
                }
                if(!sameNick){
                    User.findOneAndUpdate({_id: req.params.id}, {
                        nickname: req.body.nickname
                    }, function(err, updatedNick){
                       if(err){
                           log.error(err.toString());
                           req.flash("error", err);
                           res.redirect("/profilo");
                       } else {
                           // REDIRECT TO PROFILE
                           req.flash("success", "Salve, " + req.body.nickname + "!");
                           res.redirect("/profilo");
                       }
                    });
                }
            }
        });
    } else {
        req.flash("error", "Nickname invalido. Deve avere da 5 a 15 caratteri e può contenere solo lettere, numeri e trattini bassi!");
        res.redirect("/profilo");
    }
});

app.get("*", function(req, res){
    res.render("404");
});

var server = app.listen(process.env.PORT, process.env.IP, function (){
  console.log("Server Started!");
});

// SOCKET SETUP
var io = socket(server);

io.use(passportSocketIo.authorize({
    cookieParser: cookieParser, //optional your cookie-parser middleware function. Defaults to require('cookie-parser')
    key: "connect.sid",       //make sure is the same as in your session settings in app.js
    secret: process.env.cooKey,      //make sure is the same as in your session settings in app.js
    store: mongoStore,        //you need to use the same sessionStore you defined in the app.use(session({... in app.js
    success: onAuthorizeSuccess,  // *optional* callback on success
    fail: onAuthorizeFail,     // *optional* callback on fail/error
}));

function onAuthorizeSuccess(data, accept){
    // console.log('Nuova connessione accettata, sessione: ' + data.sessionID);
    accept();
}

function onAuthorizeFail(data, message, error, accept){
    // error indicates whether the fail is due to an error or just a unauthorized client
    if(error)
    try {
        throw new Error(message);
    } catch(e){
        console.log("\n*******************************\nSocket: ");
        console.log(data.sessionID);
        console.log(e);
        console.log("*******************************\n");
    }
    // send the (not-fatal) error-message to the client and deny the connection
    return accept(new Error(message));
}

// DEBUG / HARD CODE: Cambiando questa costante, cambia il numero di player in ogni partita
const numPlayers = 4;

var ids = [];

var playerList = [];

var partite = [];

var connessioni = playerList.length;

var turno = 0;

class Player {
    constructor(socket){
        this.socket = socket;
        this.user_id = socket.request.user._id;
        this.inGame = false;
        this.username = "";
    }
}

class Partita {
    constructor(players){
        this.partita_uuid = uuid();
        this.players = players;
        this.info = [];
        this.turno = 0;
    }
}

io.on("connection", function(socket){

    // Funzione per mandare un player in una pagina d'errore
    function sendToErrorPage(socket){
        io.to(socket.id).emit("redirect", "/errore");
    }

    // Ad ogni nuova connessione, controlla se il giocatore era già connesso
    function wasPlayerHere(socket){
        var found = " FINE RICERCA [NOT FOUND]\n\\========================/\n\n";
        console.log("\n/========================\\\n INIZIO RICERCA GIOCATORI\n");
        for(var i = 0; i < playerList.length; i++){
            if(playerList[i].user_id.toString() == socket.request.user._id.toString()){
                console.log("**************************\nID del giocatore trovato: " + playerList[i].user_id);
                console.log("che è uguale a");
                console.log("ID corrente: " + socket.request.user._id + "\n**************************\n");
                console.log("  FINE RICERCA [SUCCESS]\n\\========================/\n\n");
                newConnection(playerList[i], socket);
                return 0;
            } else {
                console.log("**************************\nID del giocatore trovato: " + playerList[i].user_id);
                console.log("che è diverso da");
                // console.log("playerList[i].user_id");
                // console.log(typeof(playerList[i].user_id));
                // console.log("socket.request.user._id");
                // console.log(typeof(socket.request.user._id));
                console.log("ID corrente: " + socket.request.user._id + "\n**************************\n");
            }
        }
        // DEBUG
        // emitList();
        console.log(found);
        newConnection(false, socket);
    }

    // Se sì, associa il nuovo socket al giocatore, altrimenti crea un nuovo oggetto Player
    function newConnection(foundPlayer, socket){
        
        // UNCOMMENT AFTER DEBUG
        // if(!foundPlayer){


            // Qua la logica per una nuova connessione da un nuovo player
            playerList.push(new Player(socket));
            console.log("Trovato nuovo giocatore, aggiunto alla lista players");
            connessioni++;
            ids.push(socket.id);
            emitPlayers(socket);
            if(connessioni == 7){
                removePlayer(socket);
            }

            var connessioniEmit = [];
            var playerIndex = 0;

            for(var i = 0; i < playerList.length; i++){
                if(playerList[i].user_id == socket.request.user._id){
                    if(socket.request.user.nickname == ""){
                        playerList[i].username = socket.request.user.username;
                    } else {
                        playerList[i].username = socket.request.user.nickname;
                    }
                    playerIndex = i;
                }
                if(!playerList[i].inGame){
                    connessioniEmit.push(playerList[i].username);
                }
            }

            io.sockets.emit("nuovaConnessione", {usernames: connessioniEmit, connessioni: connessioni, index: playerIndex + 1});

            printPlayers();

            // !! DA RISOLVERE!!! Prendi i primi numPlayers giocatori NON inGame!!!
            // if(connessioni > numPlayers){
                // Se le connessioni sono più di numPlayers, prendi solo i primi numPlayers player
                // var playerListTemp = [];
                // for(var i = 0; i < numPlayers; i++){
                //     playerListTemp.push(playerList[i]);
                // }
                // In caso di errore durante la creazione di una nuova partita, resetta la playerList
            //     if(!iniziaPartita(playerListTemp)){
            //         playerList = [];
            //         ids = [];
            //         connessioni = 0;
            //         console.log("Connessioni resettate a " + connessioni);
            //     };
            // }
            if(connessioni === numPlayers){
                // In caso di errore durante la creazione di una nuova partita, resetta la playerList
                if(!iniziaPartita(playerList)){
                    playerList = [];
                    ids = [];
                    connessioni = 0;
                    console.log("Connessioni resettate a " + connessioni);
                };
            };
            console.log("\n******************");
            console.log(connessioni + " player totali");
            console.log("******************\n");


            
        // } else {
        //     foundPlayer.socket.id = socket.id;
        //     console.log("Giocatore riconnesso, lista players aggiornata");
        //     printPlayers();
        // }

        // DEBUG
        // emitList();
    }

    // FOR DEBUG ONLY! REMOVE AFTER DEBUGGING.
    // setInterval(function(){
    //     socket.emit("playerlist", playerList);
    // }, 1000);
    // function emitList(){socket.emit("playerlist", playerList);};

    function emitPlayers(socket){
        socket.emit("id", {
            id: socket.id,
            giocatori: connessioni
        });
    }
    
    function printPlayers(){
        console.log("\n/========================\\\n  STAMPA LISTA GIOCATORI");
        for(var i = 0; i < playerList.length; i++){
            console.log("\n******************\nGIOCATORE " + (i + 1));
            console.log("Socket ID: " + playerList[i].socket.id);
            console.log("User ID: " + playerList[i].user_id);
            console.log("In Game: " + playerList[i].inGame);
            console.log("Username: " + playerList[i].username);
            console.log("******************");
        }
        console.log("\n FINE DELLA STAMPA PLAYER\n\\========================/\n\n");
    }

    // Questa funzione ASYNC serve per stampare la lista dei giocatori CERCANDO LO USERNAME
    async function printPlayersFindUsername(){
        for(var i = 0; i < playerList.length; i++){
            await User.findById(playerList[i].user_id, function(err, foundPlayer){
                if(err){
                    Promise.resolve("Errore di mongoose nella ricerca del player:" + err);
                } else {
                    Promise.resolve(foundPlayer);
                }
            })
            .then(function(foundPlayer){
                console.log("\nGIOCATORE " + (i + 1) + ":");
                if(foundPlayer.nickname == ""){
                    console.log("Username: " + foundPlayer.username);
                } else {
                    console.log("Nickname: " + foundPlayer.nickname);
                };
                console.log("Socket ID: " + playerList[i].socket.id);
                console.log("User ID: " + playerList[i].user_id);
                console.log("inGame: " + playerList[i].inGame);
            }).catch(function(e){
                log.error("Errore nella ricerca username: " + e);
            });
        }
    }

    function trovaPlayerInPartita(socket){
        for(var i = 0; i < partite.length; i++){
            for(var j = 0; j < partite[i].players.length; j++){
                if(partite[i].players[j].socket.id == socket.id){
                    return {
                        partitaIndex: i,
                        playerIndex: j,
                        socket: socket
                    };
                }
            }
        }
        return false;
    };

    // Rimuove l'oggetto Player con il socket attuale
    function removePlayer(socket){
        for(var i = 0; i < playerList.length; i++){
            if(playerList[i].user_id == socket.request.user._id){
                if(!playerList[i].inGame){
                    connessioni--;
                    console.log("Il giocatore era in attesa, una connessione è stata sottratta");
                }
                socket.emit("redirect", "/rimosso");
                console.log("Rimosso il player " + playerList[i].user_id + " con socket ID " + socket.id);
                playerList.splice(i, 1);
                printPlayers();
                for(var i = 0; i < playerList.length; i++){
                    if(!playerList[i].inGame){
                        emitPlayers(socket);
                    }
                }
                return true;
            }
            // DEBUG
            // emitList();
        }
        var playerInPartita = trovaPlayerInPartita(socket);
        if(!playerInPartita){
            log.error("Errore nella rimozione del socket " + socket.id);
            sendToErrorPage(socket);
            console.log("Socket rimosso da /dubito");
            return false;
        } else {
            // Rimuovi giocatore dalla partita
            playerInPartita.socket.emit("redirect", "/rimosso");
            console.log("Rimosso il player " + partite[playerInPartita.partitaIndex].players[playerInPartita.playerIndex].username
            + " nella partita " + partite[playerInPartita.partitaIndex].partita_uuid);
            partite[playerInPartita.partitaIndex].players.splice(playerInPartita.playerIndex, 1);
            return true;
        }
    }

    wasPlayerHere(socket);


    function iniziaPartita(Players){

        var usernames = [];

        // Controlla che tutti i Players non siano inGame
        var badGame = false;
        for (var i = 0; i < Players.length; i++){
            if (Players[i].inGame == true){
                // sendToErrorPage(socket) "manuale" perché non si ha il parametro socket
                io.to(Players[i].socket.id).emit("redirect", "/errore");
                badGame = true;
            } else {
                Players[i].inGame = true;
                usernames.push(Players[i].username);
            }
        }
        // Se un player è già inGame, c'è un errore e badGame sarà true
        if(badGame){
            return false;
        }

        var nuovaPartita = new Partita(Players);

        // Il turno va da 0 al numero di player - 1, come l'index dell'array Players
        var mazzoTemp = [];
        var mazzo = require("./models/mazzo");
        var mazzoTemp = [];
        var playerMinus = Players.length - 1;
        for (var i = 0; i < mazzo.length; i++){
            mazzoTemp.push(mazzo[i]);
            if (i + 1 == (Players.length - playerMinus) * Math.floor(mazzo.length / Players.length)){
                // playerMinus = Players.length -> 0, playerPlus = 0 -> Players.length
                var playerPlus = Players.length - 1 - playerMinus;
                io.to(Players[playerPlus].socket.id).emit("carte", mazzoTemp);
                nuovaPartita.info.push({
                    user_id: Players[playerPlus].user_id,
                    mazzo: mazzoTemp
                });

                playerMinus--;
                mazzoTemp = [];
            }
        };

        for(var i = 0; i < nuovaPartita.players.length; i++){
            // ATTENZIONE!! RICORDA CHE STAI INDIANDO LA PARTITA UUID
            nuovaPartita.players[i].socket.emit("avversari", {usernames: usernames, partita_uuid: nuovaPartita.partita_uuid});
            nuovaPartita.players[i].socket.join(nuovaPartita.partita_uuid);
        }

        console.log("_____________________\n");
        console.log("Nuova partita creata: " + nuovaPartita.partita_uuid);
        console.log(nuovaPartita);
        console.log("_____________________\n");

        io.to(Players[nuovaPartita.turno].socket.id).emit("turno", turno);

        partite.push(nuovaPartita);

        return true;
    }

    socket.on("cartaSend", function(data){
        var playerInPartita = trovaPlayerInPartita(socket);
        if(!playerInPartita){
            removePlayer(socket);
        } else {
            var partitaIndex = playerInPartita.partitaIndex;
            var playerIndex = playerInPartita.playerIndex;
            var partita = partite[partitaIndex];
            // Solo se è il turno del socket che emette la carta, allora emetti a tutti la carta inviata
            if(partita.turno == playerIndex){
                // Aumenta il turno di uno, se il turno è pari al numero del giocatori totali, allora il giro ricomincia
                if(partita.turno >= 0 && partita.turno.toString() < (partita.players.length - 1).toString()){
                    partita.turno++;
                    partita.players[partita.turno].socket.emit("cartaReceive", data);
                } else if(partita.turno >= partita.players.length - 1){
                    partita.turno = 0;
                    partita.players[partita.turno].socket.emit("cartaReceive", data);
                } else {
                    log.warn("ATTENZIONE, numero turno invalido: " + partita.turno);
                    partita.turno = 0;
                    partita.players[partita.turno].socket.emit("cartaReceive", data);
                };
                console.log("Turno del giocatore " + (partita.turno + 1).toString());
                socket.emit("senderSuccess", "Hai inviato la carta!");
                io.to(partita.players[partita.turno]).emit("receiverSuccess", "Hai ricevuto la carta!");
                io.to(partita.players[partita.turno]).emit("turno", partita.turno);
            } else {
                // Se non è il turno del socket che emette la carta, allora emetti "noturno"
                socket.emit("noturno", true);
            };
        }

    });

    // Tasto di debug per impostare a 0 il numero di socket connessi
    socket.on("reset", function(data){
        if(data.reset === true && socket.request.user._id == "5d93afc3de69e01da8b64efe"){
            playerList = [];
            ids = [];
            connessioni = 0;
            console.log("Connessioni resettate a " + connessioni);
        }
    });

    socket.on("disconnect", function(){
        console.log("\nSocket " + socket.id + " disconnesso");
        removePlayer(socket);
    });
});

