//& dependencies - import necessary modules

const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const { createCanvas, loadImage } = require('canvas');
require('dotenv').config();
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
//require("./populatedb")
//require("./showdb")

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//& Configuration and Setup - express application created, port set to 3000
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;
const accessToken = process.env.EMOJI_API_KEY;
const dbFileName = 'your_database_file.db';
let db = "";

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

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
            likes INTEGER NOT NULL
        );
    `);

    console.log('Established Connection with Database');
    //await db.close();
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
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
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
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    res.locals.apiKey = accessToken;
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => {
    const posts = await getPosts();
    const user = getCurrentUser(req) || {};
    res.render('home', { posts, user, loggedIn: req.session.loggedIn });
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
app.post('/posts', (req, res) => {
    // TODO: Add a new post and redirect to home
    const { title, content } = req.body;
    const user = getCurrentUser(req);
    addPost(title, content, user);
    res.status(200).redirect('/');
});
app.post('/like/:id', isAuthenticated, (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    const post = posts.find(post => post.id === postId);

    if (post) {
        const userIndex = post.likedBy.indexOf(userId);
        if (userIndex === -1) {
            // User has not liked the post yet, so like it
            post.likes += 1;
            post.likedBy.push(userId);
        } else {
            // User has already liked the post, so unlike it
            post.likes -= 1;
            post.likedBy.splice(userIndex, 1);
        }
        res.json({ success: true, likes: post.likes });
    } else {
        res.status(404).json({ success: false, message: 'Post not found' });
    }
});
app.get('/profile', isAuthenticated, (req, res) => {
    const user = getCurrentUser(req);
    if (user) {
        const userPosts = getUserPosts(user.username);
        res.render('profile', { profileError: req.query.error, user, posts: userPosts });
    } else {
        res.redirect('/login');
    }
});


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
app.post('/login', (req, res) => {
    loginUser(req, res);
});
app.get('/logout', (req, res) => {
    logoutUser(req, res);
});
app.post('/delete/:id', isAuthenticated, (req, res) => {
    // TODO: Delete a post if the current user is the owner
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
    { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0, likedBy: [] },
    { id: 2, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    { id: 3, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    { id: 4, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    { id: 5, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    { id: 6, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
    { id: 7, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, likedBy: [] },
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
function findUserById(userId) {
    const user = users.find((user) => user.id === userId);
    return user;
}

function getUserPosts(username) {
    return posts.filter(post => post.username === username);
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
    //console.log('isAuthenticated check:', req.session.userId); 
    //console.log(getCurrentUser(req));
    if (req.session.userId) {
        next();
    } else {
        if (req.originalUrl.startsWith('/like/')) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
        } else {
            res.redirect('/login');
        }
    }
}

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

function loginUser(req, res) {
    console.log("In loginUser function");
    const user = findUserByUsername(req.body.username);
    //const userExists = checkUserExists(req.body.username);
    if (!user) {
        res.redirect('/login?error=User doesn\'t exist');
    } else {
        req.session.loggedIn = true;
        console.log("is logged in:" , req.session.loggedIn);
        req.session.userId = user.id; // Ensure the correct user ID is set
        res.redirect('/');
    }
}

async function checkUserExists(username) {
    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        return !!user; // Returns true if user exists, false otherwise
    } catch (error) {
        console.error('Error checking user existence:', error);
        return false; // Return false in case of any error
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
function getCurrentUser(req) {
    const userId = req.session.userId;
    if (userId) {
        return findUserById(userId); // Assuming you have a function that finds a user by their ID
    }
    return null;
}

// Function to get all posts, sorted by latest first
// function getPosts() {
//     return posts.slice().reverse();
// }

async function getPosts() {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        const posts = await db.all('SELECT * FROM posts');

        await db.close();

        return posts;
    } catch (error) {
        console.error('Error fetching posts from database:', error);
        throw error; // Propagate the error
    }
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

async function addPost(title, content, username) {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        // Insert the new post into the posts table
        await db.run(
            'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, datetime("now"), 0)',
            [title, content, username]
        );

        await db.close();

        console.log('Post added to the database successfully');
    } catch (error) {
        console.error('Error adding post to the database:', error);
        throw error; // Propagate the error
    }
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