/**
 * Weather Command - Get weather information using OpenWeather API
 */

const axios = require('axios');

module.exports = {
    pattern: "weather",
    alias: ["w", "clima"],
    desc: "Get weather for a city",
    category: "utility",
    react: "🌤️",
    filename: __filename,
    use: ".weather <city>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            if (args.length === 0) {
                return await reply('❌ Usage: .weather <city>\n\nExample: .weather London');
            }
            
            const city = args.join(' ');
            const apiKey = '4902c0f2550f58298ad4146a92b65e10';
            
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`, {
                timeout: 10000
            });
            
            const weather = response.data;
            
            let weatherText = `🌤️ *Weather in ${weather.name}*\n\n`;
            weatherText += `🌡️ Temperature: ${weather.main.temp}°C\n`;
            weatherText += `🌡️ Feels Like: ${weather.main.feels_like}°C\n`;
            weatherText += `📝 Conditions: ${weather.weather[0].description}\n`;
            weatherText += `💧 Humidity: ${weather.main.humidity}%\n`;
            weatherText += `💨 Wind Speed: ${weather.wind.speed} m/s\n`;
            
            if (weather.rain) {
                weatherText += `🌧️ Rain: ${weather.rain['1h'] || weather.rain['3h'] || 'N/A'} mm\n`;
            }
            
            if (weather.snow) {
                weatherText += `❄️ Snow: ${weather.snow['1h'] || weather.snow['3h'] || 'N/A'} mm\n`;
            }
            
            weatherText += `\n_Data from OpenWeatherMap_`;
            
            await reply(weatherText);
            
            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[weather] error:', error);
            
            if (error.response?.status === 404) {
                await reply(`❌ City "${args.join(' ')}" not found. Please check the city name and try again.`);
            } else if (error.response?.status === 401) {
                await reply('❌ Weather API key is invalid. Please contact the bot owner.');
            } else if (error.code === 'ECONNABORTED') {
                await reply('❌ Request timed out. Please try again later.');
            } else {
                await reply('❌ Sorry, I could not fetch the weather right now. Please try again later.');
            }
        }
    }
};