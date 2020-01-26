const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();
const User = require('../models/user');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id).then((user) => {
        done(null, user);
    });
});

passport.use(
    new GoogleStrategy({
        // options for google strategy
        clientID: process.env.clientID,
        clientSecret: process.env.clientSecret,
        callbackURL: '/autenticazione/google/redirect'
    }, (accessToken, refreshToken, profile, done) => {
        // check if user already exists in our own db
        User.findOne({googleId: profile.id}).then((currentUser) => {
            if(currentUser){
                // already have this user
                console.log('Nuovo login: ', currentUser.username);
                done(null, currentUser);
            } else {
                // if not, create user in our db
                new User({
                    googleId: profile.id,
                    username: profile.displayName,
                    thumbnail: profile._json.picture,
                    nickname: "",
                    stats: {
                        rank: "",
                        punti: 0,
                        partiteGiocate: [],
                        vittorie: 0,
                        sconfitte: 0,
                        vittorieConsecutive: 0,
                        warns: [],
                        carteGiocate: 0,
                        obiettivi: [],
                        medaglie: []
                    }
                }).save().then((newUser) => {
                    console.log('Creato nuovo utente: ', newUser.username);
                    done(null, newUser);
                });
            }
        });
    })
);