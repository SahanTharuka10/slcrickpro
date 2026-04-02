const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });

const uri = process.env.MONGO_URI;
console.log('Connecting to:', uri.replace(/:([^@]+)@/, ':****@')); // Hide password in logs

mongoose.connect(uri, {
    dbName: 'crickdb',
    serverSelectionTimeoutMS: 5000,
}).then(() => {
    console.log('✅ Connection Successful!');
    process.exit(0);
}).catch(err => {
    console.error('❌ Connection Failed:', err.message);
    process.exit(1);
});
