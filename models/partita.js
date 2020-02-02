const { uuid } = require('uuidv4');
class Partita {
    constructor(players){
        this.partita_uuid = uuid();
        this.players = players;
        this.turno = 0;
        this.carteInMezzo = [];
        this.primoPlayer = false;
        this.giocate = 0;
    }
}
module.exports = Partita;