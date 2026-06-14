import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: 'fXWN03loYppjLhDxONccXj0HMY8UBQW9',
    socket: {
        host: 'needle-pickle-substance-11758.db.redis.io',
        port: 10267
    }
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

await client.set('foo', 'bar');
const result = await client.get('foo');
console.log(result)  // >>> bar

