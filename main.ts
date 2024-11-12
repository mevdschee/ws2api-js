import { parseArgs } from "jsr:@std/cli/parse-args";

const flags = parseArgs(Deno.args, {
    string: ["listen","url"],
    default: { listen: ":4000", url:"http://localhost:5000/" },
    unknown: function(flag) {console.log("Unknown flags: "+flag); Deno.exit(1); }
  });

const listenHost: string = flags.listen.substring(0,flags.listen.indexOf(':'));
const listenPort: number = parseInt(flags.listen.substring(flags.listen.indexOf(':')+1));

console.log("Proxying to " + flags.url);

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
        if (request.headers.get("upgrade") === "websocket") {
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
        } else {
            // If the request is a normal HTTP request,
            // we serve the client HTML file.
            //const file = await Deno.open("./index.html", { read: true });
            return new Response('hello world');
        }
    },
});