// populatedb.js

const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

// Placeholder for the database file name
const dbFileName = 'your_database_file.db';

async function initializeDB() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL DEFAULT 0,
            likedBy TEXT DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId INTEGER NOT NULL,
            username TEXT NOT NULL,
            bidAmount INTEGER NOT NULL,
            bidTime DATETIME NOT NULL,
            FOREIGN KEY(itemId) REFERENCES posts(id),
            FOREIGN KEY(username) REFERENCES users(username)
        );

        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            username TEXT NOT NULL,
            FOREIGN KEY(postId) REFERENCES posts(id),
            FOREIGN KEY(username) REFERENCES users(username)
        );

        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            username TEXT NOT NULL,
            FOREIGN KEY(postId) REFERENCES posts(id),
            FOREIGN KEY(username) REFERENCES users(username)
        );
    `);

    // Additional column checks and schema logs
    try {
        await db.exec('ALTER TABLE posts ADD COLUMN likedBy TEXT DEFAULT \'[]\'');
    } catch (error) {
        if (error.code !== 'SQLITE_ERROR' || !error.message.includes('duplicate column name')) {
            throw error;
        }
    }

    try {
        await db.exec('ALTER TABLE posts ADD COLUMN imageURL TEXT');
    } catch (error) {
        if (error.code !== 'SQLITE_ERROR' || !error.message.includes('duplicate column name')) {
            throw error;
        }
    }

    try {
        await db.exec('ALTER TABLE posts ADD COLUMN currentBid INTEGER DEFAULT 0');
    } catch (error) {
        if (error.code !== 'SQLITE_ERROR' || !error.message.includes('duplicate column name')) {
            throw error;
        }
    }

    try {
        await db.exec('ALTER TABLE posts ADD COLUMN auctionEndTime DATETIME');
    } catch (error) {
        if (error.code !== 'SQLITE_ERROR' || !error.message.includes('duplicate column name')) {
            throw error;
        }
    }

    // Sample data - Replace these arrays with your own data
    const users = [
        {
            id: 1,
            username: 'jjohn679',
            hashedGoogleId: '115763544242360936074',
            avatar_url: null,
            memberSince: '2024-06-05 11:43'
        },
        {
            id: 2,
            username: 'randoUser',
            hashedGoogleId: '115926822058135809010',
            avatar_url: null,
            memberSince: '2024-06-05 11:51'
        }
    ];

    let posts = [
        {
            id: 1,
            title: 'Water Bottle',
            content: 'Water Bottle with Delicious Water',
            username: 'jjohn679',
            timestamp: '2024-06-05 11:44',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613057788.jpeg',
            currentBid: 0,
            auctionEndTime: null
          },
          {
            id: 2,
            title: 'Stainless Steel Bento Box',
            content: "It doesn't break! or scratch!",
            username: 'jjohn679',
            timestamp: '2024-06-05 11:48',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613335031.jpg',
            currentBid: 2,
            auctionEndTime: null
          },
          {
            id: 3,
            title: 'Galaxy Wolf Hoodie',
            content: 'Unleash the animal inside you!',
            username: 'jjohn679',
            timestamp: '2024-06-05 11:49',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613393688.jpg',
            currentBid: 50,
            auctionEndTime: null
          },
          {
            id: 4,
            title: 'Lebron Poster',
            content: 'Poster of my glorious king, lepookie, for sale! treat it well🤓',
            username: 'jjohn679',
            timestamp: '2024-06-05 11:51',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613477194.jpg',
            currentBid: 0,
            auctionEndTime: null
          },
          {
            id: 5,
            title: 'Baseball',
            content: 'Just a regular baseball. Nothing else...',
            username: 'randoUser',
            timestamp: '2024-06-05 11:52',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613555523.jpg',
            currentBid: 0,
            auctionEndTime: null
          },
          {
            id: 6,
            title: 'Headphones',
            content: 'Headphones from my (ex) e-kitten. She left me, but left the headphones...',
            username: 'randoUser',
            timestamp: '2024-06-05 11:53',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613625257.jpg',
            currentBid: 0,
            auctionEndTime: null
          },
          {
            id: 7,
            title: 'Skateboard',
            content: 'trash ahh skateboard. Pull up to the closest skateboard meet and split the board down the middle in front of the members to rage-bait',
            username: 'randoUser',
            timestamp: '2024-06-05 11:55',
            likes: 0,
            likedBy: '[]',
            imageURL: '/uploads/1717613750724.jpg',
            currentBid: 0,
            auctionEndTime: null
          },
    ];

    // Insert sample data into the database
    await Promise.all(users.map(user => {
        return db.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
        );
    }));

    await Promise.all(posts.map(post => {
        return db.run(
            'INSERT INTO posts (title, content, username, timestamp, likes, likedBy, imageUrl, currentBid, auctionEndTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [post.title, post.content, post.username, post.timestamp, post.likes, post.likedBy, post.imageURL, post.currentBid, post.auctionEndTime]
        );
    }));

    console.log('Database populated with initial data.');
    await db.close();
}

initializeDB().catch(err => {
    console.error('Error initializing database:', err);
});