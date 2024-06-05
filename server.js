//& dependencies - import necessary modules

const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const { createCanvas, loadImage } = require('canvas');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
require('dotenv').config();
const path = require('path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const multer = require('multer');
require("./populatedb")
require("./showdb")

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//& Configuration and Setup - express application created, port set to 3000
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;
const accessToken = process.env.EMOJI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const dbFileName = 'your_database_file.db';
const secretKey = crypto.randomBytes(32).toString('hex');
let db = "";
const handlebars = require('handlebars');

handlebars.registerHelper('or', function() {
    return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

async function connect() {
    db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

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

    // Log the schema
    const schema = await db.all('PRAGMA table_info(posts)');
    console.log('Posts Table Schema:', schema);

    console.log('Established Connection with Database');
}




//& Set up Handlebars as the view engine and defines custom helpers

app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            eq: function (a, b) {
                return a === b;
            },
            incrementBid: function (currentBid) {
                return currentBid + 1; // Or any increment logic you prefer
            }
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//& Middleware
//^ middleware configures session management with a secret key and sets resave and saveUninitialized to false for better security and performance.
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: secretKey,     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
//^ this locals middleware sets some default local variables that will be available in all views

app.use((req, res, next) => {
    res.locals.appName = 'Food Blog';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Item';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    res.locals.username = req.session.username || ''; // Ensure username is available
    res.locals.apiKey = accessToken;
    next();
});


app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)


passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

app.use(passport.initialize());
app.use(passport.session());

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

//^google routes
// Google Login Route
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile'] })
);

// Google Callback Route
app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    async (req, res) => {
        const user = req.user;
        const hashedGoogleId = user.id;

        try {
            const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
            const existingUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [hashedGoogleId]);

            if (existingUser) {
                req.session.loggedIn = true;
                req.session.userId = existingUser.id;
                req.session.username = existingUser.username;
                console.log('User found in database:', existingUser); // Log the existing user
                console.log('Session:', req.session); // Log the session data
                res.redirect('/');
            } else {
                req.session.user = user;
                console.log('User not found, redirecting to register username'); // Log when user is not found
                res.redirect('/registerUsername');
            }
            await db.close();
        } catch (error) {
            console.error('Error during authentication:', error);
            res.redirect('/login');
        }
    }
);

// Logout Route
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/googleLogout');
    });
});

// Logout Confirmation Route
app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

//registration routes and logid
// Render Username Registration Page
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { user: req.session.user });
});

// End Auction Route
// End Auction Route
app.post('/end-auction/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const username = req.session.username; // Get the username from the session

    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        // Fetch the post
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);

        if (post && post.username === username) {
            // Fetch the highest bid
            const highestBid = await db.get('SELECT * FROM bids WHERE itemId = ? ORDER BY bidAmount DESC LIMIT 1', [postId]);

            if (highestBid) {
                // Add post to seller's "My Sales"
                await db.run(
                    'INSERT INTO sales (postId, username) VALUES (?, ?)',
                    [postId, username]
                );

                // Add post to buyer's "My Purchases"
                await db.run(
                    'INSERT INTO purchases (postId, username) VALUES (?, ?)',
                    [postId, highestBid.username]
                );

                // Mark post as sold
                await db.run('UPDATE posts SET auctionEndTime = ? WHERE id = ?', [new Date().toISOString(), postId]);
            } else {
                res.status(404).json({ success: false, message: 'No bids found for this post' });
            }
        } else {
            res.status(404).json({ success: false, message: 'Post not found or you are not the owner' });
        }

        await db.close();
        res.json({ success: true });
    } catch (error) {
        console.error('Error ending auction:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});



// Handle Username Registration
app.post('/registerUsername', async (req, res) => {
    console.log('Registering username for:', req.session.user);
    const { username } = req.body;
    const hashedGoogleId = req.session.user.id;

    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        // Check if username already exists
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.render('registerUsername', { error: 'Username already taken', user: req.session.user });
        }

        // Insert new user into the database
        await db.run(
            'INSERT INTO users (username, hashedGoogleId, memberSince) VALUES (?, ?, ?)',
            [username, hashedGoogleId, getCurrentDateTime()]
        );

        req.session.loggedIn = true;
        req.session.userId = hashedGoogleId;
        req.session.username = username;
        res.redirect('/');
        await db.close();
    } catch (error) {
        console.error('Error registering username:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/bid/:id', isAuthenticated, async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const { bidAmount } = req.body;
    const username = req.session.username;

    try {
        await placeBid(itemId, username, bidAmount);
        const updatedItem = await getItem(itemId); // Get the updated item details
        res.status(200).json({ success: true, currentBid: updatedItem.currentBid });
    } catch (error) {
        console.error('Error placing bid:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.get('/item/:id', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);

    try {
        const item = await getItem(itemId);
        const bids = await getItemBids(itemId);
        res.render('itemDetail', { item, bids, user: req.user });
    } catch (error) {
        console.error('Error fetching item:', error);
        res.status(500).send('Internal Server Error');
    }
});






// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => {
    const sortBy = req.query.sortBy || 'newest';
    const posts = await getPosts(sortBy);
    const user = await getCurrentUser(req) || {};
    res.render('home', { posts, user, loggedIn: req.session.loggedIn, sortBy });
});


// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement


app.get('/post/:id', (req, res) => {
    // TODO: Render post detail page
});
app.post('/posts', upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    const imageURL = req.file ? `/uploads/${req.file.filename}` : '';

    const user = {
        username: req.session.username
    };

    if (!user.username) {
        return res.status(400).send('User is not logged in or session is invalid');
    }

    try {
        await addPost(title, content, user, imageURL);
        res.status(200).redirect('/');
    } catch (error) {
        console.error('Error adding post:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/like/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    console.log(`Received like request for post: ${postId} by user: ${userId}`);

    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        // Fetch the post
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);

        if (post) {
            let likedBy = [];
            if (post.likedBy) {
                try {
                    likedBy = JSON.parse(post.likedBy);
                } catch (error) {
                    console.error(`Failed to parse likedBy JSON for post ${postId}:`, error);
                }
            }

            const userIndex = likedBy.indexOf(userId);
            if (userIndex === -1) {
                // User has not liked the post yet, so like it
                likedBy.push(userId);
                post.likes += 1;
            } else {
                // User has already liked the post, so unlike it
                likedBy.splice(userIndex, 1);
                post.likes -= 1;
            }

            // Update the post
            await db.run('UPDATE posts SET likes = ?, likedBy = ? WHERE id = ?', [post.likes, JSON.stringify(likedBy), postId]);

            res.json({ success: true, likes: post.likes, liked: userIndex === -1 });
        } else {
            res.status(404).json({ success: false, message: 'Post not found' });
        }

        await db.close();
    } catch (error) {
        console.error('Error liking post:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


app.get('/profile', isAuthenticated, async (req, res) => {
    const user = await getCurrentUser(req);
    const sortBy = req.query.sortBy || 'newest';

    if (user) {
        const userPosts = await getUserPosts(user.username, sortBy);
        const userBids = await getUserBids(user.username);
        const userSales = await getUserSales(user.username);
        const userPurchases = await getUserPurchases(user.username);

        res.render('profile', {
            profileError: req.query.error,
            user,
            posts: userPosts,
            bids: userBids,
            sales: userSales,
            purchases: userPurchases,
            sortBy
        });
    } else {
        res.redirect('/login');
    }
});

async function getUserSales(username) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        const sales = await db.all(`
            SELECT posts.*, sales.username AS seller
            FROM sales
            JOIN posts ON sales.postId = posts.id
            WHERE sales.username = ?
        `, [username]);
        await db.close();
        return sales;
    } catch (error) {
        console.error('Error fetching user sales from database:', error);
        throw error;
    }
}


async function getUserPurchases(username) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        const purchases = await db.all(`
            SELECT posts.*, purchases.username AS buyer
            FROM purchases
            JOIN posts ON purchases.postId = posts.id
            WHERE purchases.username = ?
        `, [username]);
        await db.close();
        return purchases;
    } catch (error) {
        console.error('Error fetching user purchases from database:', error);
        throw error;
    }
}

app.get('/avatar/:username', (req, res) => {
    const username = req.params.username;
    if (!username) {
        return res.status(400).send('Username is required');
    }

    const firstLetter = username.charAt(0).toUpperCase();
    const avatar = generateAvatar(firstLetter, username);

    res.set('Content-Type', 'image/png');
    res.send(avatar);
});


app.post('/register', (req, res) => {
    registerUser(req, res);
});
app.post('/login', async (req, res) => {
    await loginUser(req, res);
});
app.get('/logout', (req, res) => {
    logoutUser(req, res);
});
app.post('/delete/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const username = req.session.username; // Get the username from the session

    console.log("Delete request for post:", postId, "by user:", username);

    try {
        const result = await deletePost(postId, username);
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, async () => {
    try {
        await connect();
        console.log(`Server is running on http://localhost:${PORT}`);
    } catch(err) {
        console.log('in here', err);
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    // { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0, likedBy: [] },
    // { id: 2, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    // { id: 3, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    // { id: 4, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    // { id: 5, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    // { id: 6, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    // { id: 7, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
];
let users = [
    { id: 1, username: 'SampleUser', avatar_url: undefined, memberSince: '2024-01-01 08:00' },
    { id: 2, username: 'AnotherUser', avatar_url: undefined, memberSince: '2024-01-02 09:00' },
];

// Function to find a user by username
function findUserByUsername(username) {
    const user = users.find((user) => user.username === username);
    return user;
}

// Function to find a user by user ID
// function findUserById(userId) {
//     const user = users.find((user) => user.id === userId);
//     return user;
// }

async function findUserById(userId) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        const user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [userId]);

        return user; // Returns the user object if found, null otherwise
    } catch (error) {
        console.error('Error finding user by ID:', error);
        throw error; // Propagate the error
    }
}

async function getUserPosts(username, sortBy = 'newest') {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        let userPosts = await db.all('SELECT * FROM posts WHERE username = ? AND auctionEndTime IS NULL', [username]);

        if (sortBy === 'newest') {
            userPosts = userPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else if (sortBy === 'oldest') {
            userPosts = userPosts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        } else if (sortBy === 'most-likes') {
            userPosts = userPosts.sort((a, b) => b.likes - a.likes);
        } else if (sortBy === 'least-likes') {
            userPosts = userPosts.sort((a, b) => a.likes - b.likes);
        }

        await db.close();

        return userPosts;
    } catch (error) {
        console.error('Error fetching user posts from database:', error);
        throw error; // Propagate the error
    }
}
 


function getCurrentDateTime() {
    const now = new Date();
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// Function to add a new user
function addUser(username) {
    const userExists = users.some((user) => user.username === username);
    if (!userExists) {
        const newUser = {
            id: users.length + 1,
            username,
            avatar_url: undefined,
            memberSince: getCurrentDateTime(),
        }
        users.push(newUser);
        return true;
    } else {
        return false;
    }
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        res.redirect('/login');
    }
}


function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

//protected route example
// Example of a protected route
app.get('/profile', ensureAuthenticated, (req, res) => {
    res.render('profile', { user: req.user });
});

// Function
    function registerUser(req, res) {
   // console.log(req.body.register);
    const success = addUser(req.body.register);

    //console.log(users);
    if (success) {
        res.status(200).redirect('/login');
    } else {
        res.status(401).redirect('/login');
    }
    }

// Function to login a user
// function loginUser(req, res) {
//     const user = findUserByUsername(req.body.username);
//     if (user === undefined) {
//         req.query.error = "User doesn't exist";
//         return res.status(401).redirect('/login');
//     } else {
//         console.log(req.session.userId);
//         req.session.loggedIn = true;
//         req.session.userId = user.userId;
//         return res.status(200).redirect('/');
//     }
// }

async function loginUser(req, res) {
    const user = await checkUsernameExists(req.body.username);
    if (!user) {
        res.redirect('/login?error=User doesn\'t exist');
    } else {
        req.session.loggedIn = true;
        req.session.userId = user.hashedGoogleId; // Ensure the correct user ID is set
        req.session.username = user.username; // Store the username in the session
        console.log("User logged in:", user.username);
        res.redirect('/');
    }
}


async function checkUsernameExists(username) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

        return user; 
    } catch (error) {
        console.error('Error checking username existence:', error);
        throw error; // Propagate the error
    }
}

// Function to logout a user
function logoutUser(req, res) {
    req.session.destroy(err => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            res.redirect('/login');
        }
    });
}

// Function to render the profile page
function renderProfile(req, res) {
    // TODO: Fetch user posts and render the profile page
}

// Function to update post likes
function updatePostLikes(req, res) {
    // TODO: Increment post likes if conditions are met
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
}

// Function to get the current user from session
async function getCurrentUser(req) {
    if (req.isAuthenticated()) {
        const userId = req.user.id; // Assuming req.user contains the authenticated user's profile
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        const user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [userId]);
        await db.close();
        return user;
    }
    return null;
}


// Function to get all posts, sorted by latest first
// function getPosts() {
//     return posts.slice().reverse();
// }

async function getPosts(sortBy = 'newest') {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        let posts = await db.all('SELECT * FROM posts');

        if (sortBy === 'newest') {
            posts = posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else if (sortBy === 'oldest') {
            posts = posts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        } else if (sortBy === 'most-likes') {
            posts = posts.sort((a, b) => b.likes - a.likes);
        } else if (sortBy === 'least-likes') {
            posts = posts.sort((a, b) => a.likes - b.likes);
        }

        await db.close();

        return posts;
    } catch (error) {
        console.error('Error fetching posts from database:', error);
        throw error; // Propagate the error
    }
}

async function getUserBids(username) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        const userBids = await db.all(`
            SELECT posts.*, bids.bidAmount
            FROM bids
            JOIN posts ON bids.itemId = posts.id
            WHERE bids.username = ? AND posts.auctionEndTime IS NULL
            ORDER BY bids.bidTime DESC
        `, [username]);

        await db.close();

        return userBids;
    } catch (error) {
        console.error('Error fetching user bids from database:', error);
        throw error; // Propagate the error
    }
}



async function getItem(itemId) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    const item = await db.get('SELECT * FROM posts WHERE id = ?', [itemId]);
    await db.close();
    return item;
}


async function getItemBids(itemId) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    const bids = await db.all('SELECT * FROM bids WHERE itemId = ? ORDER BY bidTime DESC', [itemId]);
    await db.close();
    return bids;
}

// Function to add a new post
// function addPost(title, content, user) {
//     const newPost = {
//         id: posts.length + 1,
//         title,
//         content,
//         username: user.username,
//         timestamp: getCurrentDateTime(),
//         likes: 0
//     };
//     posts.push(newPost);
// }

async function addPost(title, content, user, imageURL) {
    if (!user || !user.username) {
        throw new Error('User object or username is undefined');
    }

    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        await db.run(
            'INSERT INTO posts (title, content, username, timestamp, likes, likedBy, imageURL) VALUES (?, ?, ?, ?, 0, ?, ?)',
            [title, content, user.username, getCurrentDateTime(), '[]', imageURL]
        );

        await db.close();

        console.log('Post added to the database successfully');
    } catch (error) {
        console.error('Error adding post to the database:', error);
        throw error;
    }
}

async function deletePost(postId, username) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        // Verify if the post exists and belongs to the user
        const post = await db.get('SELECT * FROM posts WHERE id = ? AND username = ?', [postId, username]);
        console.log(`Deleting post: ${postId} by user: ${username}`);

        if (post) {
            // Delete the post
            await db.run('DELETE FROM posts WHERE id = ?', [postId]);
            await db.close();
            return { success: true };
        } else {
            await db.close();
            console.log(`Post not found or user ${username} is not the owner of post ${postId}`);
            return { success: false, message: 'Post not found or you are not the owner' };
        }
    } catch (error) {
        console.error('Error deleting post from database:', error);
        throw error; // Propagate the error
    }
}

async function placeBid(itemId, username, bidAmount) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    const item = await db.get('SELECT * FROM posts WHERE id = ?', [itemId]);

    if (!item) {
        throw new Error('Item not found');
    }

    if (bidAmount <= item.currentBid) {
        throw new Error('Bid amount must be higher than current price');
    }

    await db.run(
        'INSERT INTO bids (itemId, username, bidAmount, bidTime) VALUES (?, ?, ?, ?)',
        [itemId, username, bidAmount, getCurrentDateTime()]
    );

    await db.run('UPDATE posts SET currentBid = ? WHERE id = ?', [bidAmount, itemId]);

    await db.close();
}


const colors = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33A6', '#FF8F33', 
    '#33FFF3', '#A633FF', '#33FF8F', '#FF3333', '#33FF85'
];

// Function to generate an image avatar
function generateAvatar(letter, username, width = 100, height = 100) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    // Determine color based on username to keep it consistent
    const colorIndex = username.charCodeAt(0) % colors.length;
    const backgroundColor = colors[colorIndex];

    // Background color
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);

    // Text color and font
    context.fillStyle = '#fff'; // Keep text color white
    context.font = `${height / 2}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Draw the letter
    context.fillText(letter, width / 2, height / 2);

    return canvas.toBuffer('image/png');
}