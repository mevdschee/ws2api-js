import { parseArgs } from "jsr:@std/cli/parse-args";
import { Mutex } from "https://deno.land/x/async@v2.1.0/mutex.ts";

// main
function main() {
    const flags = parseArgs(Deno.args, {
        string: ["listen","url"],
        default: { listen: ":4000", url:"http://localhost:5000/" },
        unknown: function(flag) {console.log("Unknown flags: "+flag); Deno.exit(1); }
    });

    const listenHost: string = flags.listen.substring(0,flags.listen.indexOf(':'));
    const listenPort: number = parseInt(flags.listen.substring(flags.listen.indexOf(':')+1));
    const wsh = new WebSocketHandler(flags.url);

    console.log("Proxying to " + flags.url);

    Deno.serve({
        hostname: listenHost,
        port: listenPort,
        handler: wsh.ServeHTTP,
    });
};

// WebSocketHandler

class WebSocketHandler {
	
    private mutex     :Mutex;
	private sockets   :{
        [address: string]: WebSocketConnection;
    };
    private serverUrl: string;

    constructor(serverUrl: string) {
        this.mutex = new Mutex();
        this.sockets = {};
        this.serverUrl = serverUrl;
    }
    
    private storeConnection(c: WebSocket, address: string): WebSocketConnection {
        const s = new WebSocketConnection(c);
        try {
            this.mutex.acquire();
            this.sockets[address] = s;
        } finally {
            this.mutex.release();
        }
        return s
    }
    
    private retrieveConnection(address: string): WebSocketConnection {
        let s:WebSocketConnection
        try {
            this.mutex.acquire();
            s = this.sockets[address];
        } finally {
            this.mutex.release();
        }
        return s
    }

    public async ServeHTTP(request: Request): Promise<Response> {
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
        const fetchResponse = await fetch(this.serverUrl+address);
        if (!fetchResponse.ok) {
            return new Response('error when proxying connect', { status: 502 });
        }
        const responseString = await fetchResponse.text();
        if (responseString!= 'ok') {
            return new Response('not allowed to connect: ' + responseString, { status: 403 });
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
    }
}

// WebSocketConnection

class WebSocketConnection {
	private readLock   :Mutex;
	private writeLock  :Mutex;
	private connection :WebSocket;

    constructor(connection: WebSocket) {
        this.readLock = new Mutex();
        this.writeLock = new Mutex();
        this.connection = connection;
    }
}

main();
