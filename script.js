(function clavoBezumie(options) {
    const start = performance.now();
    const modes = {
        'Буквы': 'chars',
        'Абракадабра': 'abra',
        'Периферия+': 'voc-38606',
        'Забористый': 'voc-13589',
        'Мизинцы+': 'voc-3714',
    };
    
    const modePointsMultiplier = {
        'Буквы': 1,
        'Абракадабра': 1.1,
        'Периферия+': 1.2,
        'Забористый': 1.3,
        'Мизинцы+': 1.3,
    };
    
    getActiveUsers(modes)
        .then(parseData)
        .then(showResults);
    
    function getActiveUsers(modes) {
        const users = {};
        const modePromises = Object.entries(modes).map( mode => addWeeklyTopPlayers(mode[1]) );
    
        return Promise.all(modePromises).then(() => users);
        
        async function addWeeklyTopPlayers(mode, currentPage = 1) {
            const response = await fetch(`https://klavogonki.ru/top/week/${mode}/${currentPage}`);
            const text = await response.text();
            const htmlPage = new DOMParser().parseFromString(text, 'text/html');
            
            const userBlocks = htmlPage.querySelectorAll('.other, .you');
            if (userBlocks.length === 0) return; // empty page
            
            userBlocks.forEach(userBlock => {
                const userLink = userBlock.querySelector('a');
            
                users[userLink.textContent.trim()] = {
                    id: userLink.href.match(/\d+(?=\/stats)/)[0],
                }
            });
            
            return addWeeklyTopPlayers(mode, currentPage + 1);
        }
    }
    
    function parseData(users, usersChunkLimit = 100) { // in case of too many requests get net::ERR_INSUFFICIENT_RESOURCES
        // users = Object.fromEntries(Object.entries(users).filter((user, idx) => idx < 10)); // for test only
        const usersCount = Object.keys(users).length;
        console.log('Пользователей найдено:', usersCount);
    
        const usersChunks = Object.entries(users).reduce( (acc, [userName, userData], idx) => {
            if (idx === 0 || idx % usersChunkLimit === 0) acc.push({});
    
            acc[acc.length - 1][userName] = userData;
    
            return acc;
        }, []);
    
        return iterateThroughUsersChunks()
            .then(() => usersChunks.reduce((acc, limitesUsers) => ({...acc, ...limitesUsers}), {}))
    
        async function iterateThroughUsersChunks() {
            let generator = async function*() {
                for (let i = 0; i < usersChunks.length; i++) {
                    await parseUsersChunk(usersChunks[i]);
                    yield i;
                }
            }();
        
            for await (let value of generator) {
                let counter = (value + 1) * usersChunkLimit;
                if (counter > usersCount) counter = usersCount;
                console.log(`Данные ${counter} пользователей получены`);
            }
        };
    
        async function parseUsersChunk(users) {
            const usersChunkPromises = Object.entries(users).map(([name, info]) => {
                return parsePlayerData(info).then(data => users[name] = data );
            });
    
            return Promise.all(usersChunkPromises);
        }
    }
    
    function parsePlayerData(user) {
        return Promise.all( Object.entries(modes).map(mode => getGamesCount(user.id, mode)) )
            .then(userModesData => {
                let processedData = {};
    
                if (userModesData[0].error) {
                    processedData.error = userModesData[0].error;
                    processedData.games = processedData.points = 0;
                } else {
                    processedData = userModesData.reduce( (acc, {type, count}) => {
                        acc.games += count;
                        acc.points += modePointsMultiplier[type] * count;
                        acc.modes[type] = count;
        
                        return acc;
                    }, {games: 0, points: 0, modes: {}});
        
                    processedData.points = +processedData.points.toFixed(1);
                }
    
                return {...user, ...processedData};
            });
    
        async function getGamesCount(id, mode) {
            const response = await fetch(`https://klavogonki.ru/api/profile/get-stats-details-data?userId=${id}&gametype=${mode[1]}&fromDate=2024-04-19&toDate=2024-04-30&grouping=week`);
            const data = await response.json();
    
            if (!data.ok) {
                return data.err === 'invalid gametype' ? { type: mode[0], count: 0 } : { error: data.err };
            }
    
            const totalCount = data.list.reduce( (total, cur) => total + +cur.cnt, 0);
    
            return {
                type: mode[0],
                count: totalCount
            };
        }
    }
    
    function showResults(users) {
        console.log(`Время на получение данных: ${(performance.now() - start).toFixed(3)} ms`);
    
        if (options.creditedOnly) {
            const MIN_GAMES_PER_MODE = 19;
            users = Object.fromEntries(Object.entries(users).filter( ([nickname, data]) => {
                if (data.games < MIN_GAMES_PER_MODE * Object.keys(modes).length) return false;
    
                for (let mode in modes) {
                    if (data.modes[mode] < MIN_GAMES_PER_MODE) return false;
                }
    
                return true;
            }));
        }
    
        const top = Object.entries(users).map( ([nickname, data]) => ({nickname, ...data})).sort( (a, b) => b.points - a.points);
        const total = top.reduce((acc, user) => {
            acc.games += user.games;
            acc.points += user.points;
    
            for (let mode in user.modes) {
                if (!acc.modes[mode]) acc.modes[mode] = 0;
                acc.modes[mode] += user.modes[mode];
            }
        
            return acc;
        }, {points: 0, games: 0, modes: {}});
        total.points = +total.points.toFixed(1);
    
        showTable(top, total);
    }
    
    function showTable(users, total) {
        const offsetTop = document.querySelector('.userpanel').offsetHeight + 5;
    
        const styles = {
            wrapper: `
                position: fixed;
                z-index: 9999;
                top: ${offsetTop}px;
                left: 0;
                width: 100%;
                height: ${(document.documentElement.clientHeight - offsetTop) / document.documentElement.clientHeight * 100}vh;
                padding-bottom: 30px;
            `,
            container: `
                background: #00000011;
                width: 940px;
                height: 100%;
                margin: 0 auto;
                overflow: auto;
            `,
            user: `
                display: grid;
                justify-items: center;
                grid-template-columns: 5fr 20fr 8fr 60fr 15fr 15fr;
                height: 27px;
                border-bottom: 1px solid white;
            `,
            userChild: `
                width: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
            `,
            userPlace: `
                background: #28007f;
                color: #fff;
            `,
            userName: `
                background: #d4ebd4;
            `,
            userId: `
                background: #ccc;
            `,
            userModes: `
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                justify-items: center;
            `,
            userMode: `
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
            `,
            B: `
                background: #b55900;
                color: #fff;
            `,
            A: `
                background: #3d4856;
                color: #fff;
            `,
            P: `
                background: #3c86c3;
            `,
            M: `
                background: #8e7ec0;
            `,
            Z: `
                background: #cd4227;
            `,
            userGames: `
                background: #cdcd6f;
            `,
            userPoints: `
                background: #000;
                color: #fff;
            `,
        };
    
        const titlesHTML = `
        <div style="${styles.user}">
            <div style="${styles.userChild.concat(styles.userPlace)}">№</div>
            <div style="${styles.userChild.concat(styles.userName)}">Ник</div>
            <div style="${styles.userChild.concat(styles.userId)}">id</div>
            <div style="${styles.userChild.concat(styles.userModes)}">
                <div style="${styles.userMode.concat(styles.B)}">Б</div>
                <div style="${styles.userMode.concat(styles.A)}">А</div>
                <div style="${styles.userMode.concat(styles.P)}">П+</div>
                <div style="${styles.userMode.concat(styles.M)}">М+</div>
                <div style="${styles.userMode.concat(styles.Z)}">З</div>
            </div>
            <div style="${styles.userChild.concat(styles.userGames)}">Заезды</div>
            <div style="${styles.userChild.concat(styles.userPoints)}">Очки</div>
        </div>
        `;
    
        const totalHTML = `
        <div style="${styles.user}">
            <div style="${styles.userChild.concat(styles.userPlace)}">-</div>
            <div style="${styles.userChild.concat(styles.userName)}">Итого</div>
            <div style="${styles.userChild.concat(styles.userId)}"></div>
            <div style="${styles.userChild.concat(styles.userModes)}">
                <div style="${styles.userMode.concat(styles.B)}">${total.modes?.['Буквы']}</div>
                <div style="${styles.userMode.concat(styles.A)}">${total.modes?.['Абракадабра']}</div>
                <div style="${styles.userMode.concat(styles.P)}">${total.modes?.['Периферия+']}</div>
                <div style="${styles.userMode.concat(styles.M)}">${total.modes?.['Мизинцы+']}</div>
                <div style="${styles.userMode.concat(styles.Z)}">${total.modes?.['Забористый']}</div>
            </div>
            <div style="${styles.userChild.concat(styles.userGames)}">${total.games}</div>
            <div style="${styles.userChild.concat(styles.userPoints)}">${total.points}</div>
        </div>
        `;
        
        const usersHTML = users.map( (user, idx) => {
            let error = user.error;
            
            switch (error) {
                case 'permission friends':
                    error = 'друзья';
                    break;
                case 'permission blocked':
                    error = 'скрыто';
                    break;
            }
    
            return `
            <div style="${styles.user}">
                <div style="${styles.userChild.concat(styles.userPlace)}">${idx + 1}</div>
                <div style="${styles.userChild.concat(styles.userName)}">${user.nickname}</div>
                <div style="${styles.userChild.concat(styles.userId)}">${user.id}</div>
                <div style="${styles.userChild.concat(styles.userModes)}">
                    <div style="${styles.userMode.concat(styles.B)}">${user.games === 0 ? error : user.modes?.['Буквы']}</div>
                    <div style="${styles.userMode.concat(styles.A)}">${user.games === 0 ? error : user.modes?.['Абракадабра']}</div>
                    <div style="${styles.userMode.concat(styles.P)}">${user.games === 0 ? error : user.modes?.['Периферия+']}</div>
                    <div style="${styles.userMode.concat(styles.M)}">${user.games === 0 ? error : user.modes?.['Мизинцы+']}</div>
                    <div style="${styles.userMode.concat(styles.Z)}">${user.games === 0 ? error : user.modes?.['Забористый']}</div>
                </div>
                <div style="${styles.userChild.concat(styles.userGames)}">${user.games || error}</div>
                <div style="${styles.userChild.concat(styles.userPoints)}">${user.points || error}</div>
            </div>
            `;
        }).join('');
        
        document.body.insertAdjacentHTML('beforeend', `<div style="${styles.wrapper}"><div style="${styles.container}">${titlesHTML}${usersHTML}${totalHTML}</div></div>`);
    
        const wrapper = document.body.lastElementChild;
        const container = wrapper.firstElementChild;
        document.addEventListener('click', handleClick);
    
        function handleClick(e) {
            if (container.contains(e.target)) return;
    
            wrapper.remove();
            document.removeEventListener('click', handleClick);
        }
    }
})({creditedOnly: true});