const express = require('express');
const app = express();
app.use(express.json());
app.use(express.text());

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

app.post('/', async (req, res) => {
  try {
    const message = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message })
    });
    const data = await response.json();
    console.log('Telegram response:', JSON.stringify(data));
    res.status(200).send('OK');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error');
  }
});
app.get('/', (req, res) => res.status(200).send('OK'));
app.listen(10000, () => console.log('Server running on port 10000'));
