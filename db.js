const mongoose = require('mongoose');

mongoose.set('strictQuery', true); // Or false if preferred

const dbReady = mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  });

module.exports = { dbReady };
