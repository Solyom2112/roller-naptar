// --- Roller Naptár v3 - Szerver Kód (Render PostgreSQL) ---

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { OAuth2Client } = require('google-auth-library');
const { Pool } = require('pg'); // SQLite helyett ezt használjuk!

// --- Konfiguráció ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = 'fehersolyomhoz@gmail.com';
const GOOGLE_CLIENT_ID = '8606062468-v4fjvcq0cbrunkcu0c4qcv1o1olb1rc2.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Adatbázis kapcsolat létrehozása a Render által adott címmel
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Szükséges a Render adatbázisokhoz
    }
});

// Függvény, ami létrehozza a táblát, ha még nem létezik
async function setupDatabase() {
    const createTableQuery = 
        CREATE TABLE IF NOT EXISTS bookings (
            "startTime" TEXT PRIMARY KEY,
            "endTime" TEXT NOT NULL,
            "userName" TEXT NOT NULL,
            "userEmail" TEXT NOT NULL
        );
    ;
    try {
        await pool.query(createTableQuery);
        console.log("Az 'bookings' tábla készen áll.");
    } catch (err) {
        console.error("Hiba az adatbázis tábla beállításakor:", err);
    }
}

// --- Segédfüggvények ---
async function verifyGoogleToken(token) {
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        return ticket.getPayload();
    } catch (error) {
        console.error("Token validálási hiba:", error);
        return null;
    }
}

async function broadcastBookings() {
    try {
        const result = await pool.query('SELECT * FROM bookings ORDER BY "startTime" ASC');
        io.emit('updateBookings', result.rows);
    } catch (err) {
        console.error("Hiba a foglalások lekérdezésekor:", err);
    }
}

app.use(express.static('public'));

// --- Socket.IO eseménykezelés ---
io.on('connection', async (socket) => {
    console.log('Új felhasználó csatlakozott: ' + socket.id);
    broadcastBookings(); // Elküldjük az aktuális foglalásokat

    socket.on('newBooking', async (data) => {
        const { startTime, endTime, token } = data;
        const payload = await verifyGoogleToken(token);
        if (!payload) return socket.emit('bookingError', 'Érvénytelen azonosító!');

        try {
            const overlapQuery = 
                SELECT * FROM bookings WHERE (::timestamptz, ::timestamptz) OVERLAPS ("startTime"::timestamptz, "endTime"::timestamptz)
            ;
            const overlapCheck = await pool.query(overlapQuery, [startTime, endTime]);
            if (overlapCheck.rows.length > 0) {
                return socket.emit('bookingError', 'Ez az időszak ütközik egy meglévő foglalással!');
            }
            const insertQuery = INSERT INTO bookings ("startTime", "endTime", "userName", "userEmail") VALUES (, , , );
            await pool.query(insertQuery, [startTime, endTime, payload.name, payload.email]);
            socket.emit('bookingSuccess', 'Sikeres foglalás!');
            broadcastBookings();
        } catch (err) {
            console.error("Hiba az új foglalásnál:", err);
            socket.emit('bookingError', 'Szerverhiba történt a foglalás során.');
        }
    });

    socket.on('deleteBooking', async ({ startTime, token }) => {
        const payload = await verifyGoogleToken(token);
        if (!payload) return socket.emit('bookingError', 'Érvénytelen azonosító!');
        
        try {
            let result;
            if (payload.email === ADMIN_EMAIL) {
                result = await pool.query('DELETE FROM bookings WHERE "startTime" = ', [startTime]);
            } else {
                result = await pool.query('DELETE FROM bookings WHERE "startTime" =  AND "userEmail" = ', [startTime, payload.email]);
            }
            if (result.rowCount === 0 && payload.email !== ADMIN_EMAIL) {
               return socket.emit('bookingError', 'Nincs jogosultságod a foglalás törléséhez!');
            }
            broadcastBookings();
        } catch (err) {
            console.error("Hiba a törlésnél:", err);
            socket.emit('bookingError', 'Szerverhiba történt a törlés során.');
        }
    });
});

server.listen(PORT, () => {
    console.log(A szerver a http://localhost: címen fut);
    setupDatabase(); // Elindítjuk az adatbázis beállítását a szerver indulásakor
});
