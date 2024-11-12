import { parseArgs } from "jsr:@std/cli/parse-args";
import { Mutex } from "https://deno.land/x/async@v2.1.0/mutex.ts";

const flags = parseArgs(Deno.args, {
    string: ["listen","url"],
    default: { listen: ":4000", url:"http://localhost:5000/" },
    unknown: function(flag) {console.log("Unknown flags: "+flag); Deno.exit(1); }
  });

const listenHost: string = flags.listen.substring(0,flags.listen.indexOf(':'));
const listenPort: number = parseInt(flags.listen.substring(flags.listen.indexOf(':')+1));

console.log("Proxying to " + flags.url);

interface WebSocketHandler {
	mutex     :Mutex;
	sockets   :{
        [address: string]: WebSocketConnection;
    };
}

interface WebSocketConnection {
	readLock   :Mutex;
	writeLock  :Mutex;
	connection :WebSocket;
}

Deno.serve({
    hostname: listenHost,
    port: listenPort,
    handler: (request: Request) => {
        const address:string = new URL(request.url).pathname.split('/')[1];
        if (address.length == 0) {
            return new Response('invalid url, use /address', { status: 400 });
        }
        if (request.method == 'POST') { 
            return new Response('');
        } 
        if (request.headers.get("upgrade") != "websocket") {
            return new Response('no upgrade requested', { status: 500 });
        }
        const { socket, response } = Deno.upgradeWebSocket(request);

        socket.onopen = () => {
            console.log("CONNECTED");
        };

        socket.onmessage = (event) => {
            console.log(`RECEIVED: ${event.data}`);
            socket.send("pong");
        };
        socket.onclose = () => console.log("DISCONNECTED");
        socket.onerror = (error) => console.error("ERROR:", error);

        return response;
    },
});