//import fetch from "node-fetch";
const id = process.env.Client_Id;
const secret = process.env.Client_Secret;

import('node-fetch').then(({default: fetchImported}) => {
    fetch = fetchImported;
}).catch(err => console.error('Failed to load node-fetch', err));

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

let port = 5000;

app.set('view engine', 'ejs');
app.use('/views', express.static(path.join(__dirname, '/views')));
app.use('/css', express.static(path.join(__dirname, '/css')));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, "views/index.html"));
});



const redirect_uri = "http://localhost:5000/callback";
let client_id = id;
let client_secret = secret;

global.access_token;

app.get("/authorize", (req, res) => {
    try {
        let authQueryParameters = new URLSearchParams({
            
            response_type: "code",
            client_id: client_id,
            scope: "user-read-private user-read-email playlist-modify-private playlist-modify-public",
            redirect_uri: redirect_uri

        }) 

        res.redirect("https://accounts.spotify.com/authorize?" + authQueryParameters.toString());
    }
    catch (error) {
        console.error("Authorize error: ", error.message);
        res.redirect("/error");
    }
    return null;        

});

app.get("/callback", async (req, res) => {
    try {
        const code = req.query.code || null;

        let body = new URLSearchParams({
            code: code,
            redirect_uri: redirect_uri,
            grant_type: "authorization_code"
        })

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "post",
            body: body,
            headers: {
                "Content-Type" : "application/x-www-form-urlencoded",
                Authorization: "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64")
            }
        })
        
        if (response.ok) {
            const data = await response.json();
            global.access_token = data.access_token;
        
            res.redirect("/mainPage")
        }
        else {
            console.error("Error: " + response.status);
        }

    }
    catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
    }
    return null;        
});

async function getInfoRadio(endpoint) {

    try {
        const response = await fetch("http://api.sr.se/api/v2/playlists/rightnow?channelid=" + endpoint + "&format=json", {
            method: "get",
        });

        if (response.ok) {  
            const data = await response.json();
            return data;
        }
        else {
            console.error("Error: " + response.status);
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null; 
    }
      
};

async function getInfoSpotify(endpoint) {

    try {
        const response = await fetch("https://api.spotify.com/v1" + endpoint, {
            method: "get",
            headers: { Authorization: "Bearer " + global.access_token
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data;
        }
        else {
            console.error("Error: " + response.status);
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null; 
    }

};

//metod som hämtar artist id:t
async function getIdArtistFromSpotify(endpoint) {
    try {

        const dataFromRadio = await getInfoRadio(endpoint);
  
        const artistAlteredName = encodeURI(getAlteredName(dataFromRadio.playlist.previoussong.artist));
    
        const data = await getInfoSpotify("/search?q=remaster%2520artist%3A" + artistAlteredName + "&type=artist&limit=1");
    
        return data.artists.items[0].id.toString();
    
    } catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null; 
    }
};

//metod som hämtar toplåtarna för en artist för den valda kanalen
async function getTopTracksForArtistFromSpotify(endpoint) {
    try {

        const artistID = await getIdArtistFromSpotify(endpoint);
    
        const data = await getInfoSpotify("/artists/" + artistID + "/top-tracks?market=SE");
        
        return data;
    } catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null; 
    }

};

//Metod som hämtar id:et på en låt på spotify
async function getIdSongFromSpotify(endpoint) {
    try {
        const dataFromRadio = await getInfoRadio(endpoint);
        const song = dataFromRadio.playlist.previoussong.title;
        const encodedSong = encodeURI(song);
        const artistAlteredName = encodeURI(getAlteredName(dataFromRadio.playlist.previoussong.artist));

        const data = await getInfoSpotify("/search?q=remaster%2520track%3A" + encodedSong + "%2520artist%3A" + artistAlteredName + "&type=track&limit=1");
        
        if (!data || !data.tracks || data.tracks.items.length === 0) {
            console.error("No tracks found");
            res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
            return null;
        }
        
        return data;
    
    } catch (error) {
        console.error("Error in getIdSongFromSpotify: ", error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null;
    }
}

//metod för att lägga till den senaste låten i en vald lista
async function addSongToPlayList(endpoint, songId) {
    
    const queryParams = new URLSearchParams({
        uris: `spotify:track:${songId}`,
    });

    await fetch("https://api.spotify.com/v1/playlists/" + endpoint + "/tracks?" + queryParams.toString(), {
        method: "post",
        headers: {
            Authorization: "Bearer " + global.access_token
        }
    });
    
};

//Metod som hämtar information om den låten som id representerar
async function getTrackInfoSpotify(songId) {

    try {

        const data = await getInfoSpotify("/tracks/"+songId);
        
        return data;
    } catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null; 
    }

 
};

async function getRecommendations(endpoint, songId) {

    try {

        const artistId = await getIdArtistFromSpotify(endpoint);

        const data = await getInfoSpotify("/recommendations?limit=3&market=SE&seed_artists=" + artistId + "&seed_tracks=" + songId);
        
        return data;

    } catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
        return null; 
    }
    
 
};

app.get("/error", async (req, res) => {
    res.render(path.join(__dirname, "views/error.ejs"));
});

app.get("/kanal/:channelId", async (req, res) => {
    try {
        const channelId = req.params.channelId;
        const tempData = await getIdSongFromSpotify(channelId); 
        if (!tempData || !tempData.tracks || tempData.tracks.items.length === 0) {
            throw new Error("No track data found or it's malformed");
        }
        const songId = tempData.tracks.items[0].id.toString();
        const userInfo = await getInfoSpotify("/me");
        const channelP1 = await getInfoRadio(channelId);
        const getPreviousSong = await getTrackInfoSpotify(songId);
        const getPlayList = await getInfoSpotify("/me/playlists?limit=20");
        const topPlayerSongs = await getTopTracksForArtistFromSpotify(channelId);
        const recommendations = await getRecommendations(channelId, songId);
        const artistNames = getAllArtistName(tempData.tracks.items[0].artists);

        res.render(path.join(__dirname, "views/kanal.ejs"), {
            user: userInfo, 
            playing: channelP1, 
            song: getPreviousSong, 
            playLists: getPlayList.items, 
            topSongs: topPlayerSongs, 
            recommendations: recommendations,
            songId: songId,
            globalId: global.access_token,
            artistNames: artistNames
        });
    } catch (error) {
        console.error("/kanal/:channelId error: ", error.message);
        res.status(500).send("There is no song that is playing. Please go back and wait chose another channel or wait several minutes before attempting again");
    }
});

app.get("/mainPage", async (req, res) => {


    const userInfo = await getInfoSpotify("/me");


    res.render(path.join(__dirname, "views/mainpage.ejs"), {
        user: userInfo, 
    });
});


let listener = app.listen(5000, function () {
    console.log("Your app is listening on http://localhost:" + listener.address().port);
});

function getAllArtistName(artistArray) {
    let allArtistName = "";
    
    artistArray.forEach((artist, index) => {
        if (index !== 0) { 
            allArtistName += ", ";
        }
        allArtistName += artist.name;
    });

    return allArtistName;
}

function getAlteredName(artist) {
    try {
        
        const fullNameArray = artist.split(' ');
        const firstName = fullNameArray[0];
        const surname = fullNameArray[1] || "";

        const alteredName = firstName + " " + surname;

        return alteredName;
    }
    catch (error) {
        console.error(error.message);
        res.status(500).send("An error occurred while processing your request. Please go back and wait one minute before attempting again");
    }
    return null;    
};



