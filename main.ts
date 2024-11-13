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
        handler: wsh.ServeHTTP.bind(wsh),
    });
};

// WebSocketHandler

class WebSocketHandler {
	
    private sockets   :{
        [address: string]: {
            connection :WebSocket;
            client     :Deno.HttpClient
        };
    };
    private serverUrl: string;

    public constructor(serverUrl: string) {
        this.sockets = {};
        this.serverUrl = serverUrl;
    }

    public async ServeHTTP(request: Request): Promise<Response> {
        const address:string = new URL(request.url).pathname.split('/')[1];
        if (address.length == 0) {
            return new Response('invalid url, use /address', { status: 400 });
        }
        if (request.method == 'POST') {
            const conn = this.sockets[address];
            if (!conn) {
                return new Response("could not find address: " + address, { status: 404 });
            }
            let requestBody: string
            try {
                requestBody = await request.text();
            } catch (_) {
                return new Response('could not read body', { status: 500 });
            }
            try {
                conn.connection.send(requestBody);
            } catch (_) {
                return new Response('could not send request', { status: 500 });
            }
            return new Response('ok');
        } 
        if (request.headers.get("upgrade") != "websocket") {
            return new Response('no upgrade requested', { status: 500 });
        }
        const client = Deno.createHttpClient({})
        let fetchResponse: Response
        let responseString: string;
        try {
            fetchResponse = await fetch(this.serverUrl+address,{client:client});             
            responseString = await fetchResponse.text();
        } catch (_) {
            return new Response('error while proxying connect', { status: 502 });
        }
        if (fetchResponse.status!=200) {
            console.log("error while proxying connect: "+fetchResponse.statusText);
        }
        if (responseString!= 'ok') {
            return new Response('not allowed to connect: ' + responseString, { status: 403 });
        }
        const { socket, response } = Deno.upgradeWebSocket(request);
        const conn = {connection:socket, client:client};
        this.sockets[address] = conn;
        socket.onmessage = async (event) =>  { 
            if (typeof event.data != "string") {
                console.log("binary messages not supported");
            }
            let fetchResponse: Response
            let responseString: string;
            const mu = new Mutex();
            try {
                await mu.acquire();
                fetchResponse = await fetch(this.serverUrl+address,{client:client,method:"POST",body:event.data});
                responseString = await fetchResponse.text();
            } catch (_) {
                console.log("error while proxying message");
                return
            } finally {
                mu.release();
            }
            if (fetchResponse.status!=200) {
                console.log("error while proxying message: "+fetchResponse.statusText);
            }
            if (responseString) {
                try {
                    socket.send(responseString);
                } catch (_) {
                    console.log("could not send reply");
                }
            }
        }
        return response;
    }
}

main();
