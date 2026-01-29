// launcher.js
import('./gui-server.js')
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
