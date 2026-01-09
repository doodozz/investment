/* ==== 倉位資料寫死 ==== */
let positions = [
    {market:"US", type:"stock", symbol:"ONDS", name:"Ondas Holdings", shares:120, avgPrice:5.2, currentPrice:7.3},
    {market:"US", type:"dca", symbol:"VOO", name:"VOO ETF", shares:50, avgPrice:400, currentPrice:410},
    {market:"TW", type:"stock", symbol:"2330", name:"台積電", shares:30, avgPrice:550, currentPrice:580},
    {market:"TW", type:"dca", symbol:"0050", name:"台灣50", shares:20, avgPrice:130, currentPrice:135}
];

/* ==== LocalStorage 設定 ==== */
let storageKey = "investmentAppData";
let appData = JSON.parse(localStorage.getItem(storageKey)) || {
    prices: {},           // 現價手動輸入
    cash: { basic:0, extra:0, future:[] },
    lastRateDate: null,
    USD_TWD: null
};

/* ==== 匯率抓取 (當天沒抓過才抓) ==== */
async function fetchRate() {
    const today = new Date().toISOString().slice(0,10);
    if(appData.lastRateDate === today && appData.USD_TWD) return appData.USD_TWD;

    try {
        const resp = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        const data = await resp.json();
        const rate = data.rates?.TWD;
        if(rate){
            appData.USD_TWD = rate;
            appData.lastRateDate = today;
            localStorage.setItem(storageKey, JSON.stringify(appData));
            return rate;
        }
    } catch(e){
        console.error("匯率抓取失敗", e);
        return 32; // fallback
    }
}

/* ==== 頁面切換 ==== */
function showPage(id){
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    if(id==="page-assets") renderAssets();
    if(id==="page-positions") renderPositions();
    if(id==="page-profit") renderProfit();
    if(id==="page-cash") renderCash();
}

/* ==== 資產頁 ==== */
async function renderAssets(){
    const container = document.getElementById("asset-summary");
    container.innerHTML = "載入中...";

    const rate = await fetchRate();

    let usTotal = 0, twTotal=0;
    positions.forEach(p=>{
        const price = appData.prices[p.symbol] || p.currentPrice;
        const value = price * p.shares;
        if(p.market==="US") usTotal += value;
        else twTotal += value;
    });

    container.innerHTML = `
        <div class="asset-card">美股總資產: $${usTotal.toLocaleString()} USD<br>
        換算 TWD: NT$${(usTotal*rate).toLocaleString()}</div>
        <div class="asset-card">台股總資產: NT$${twTotal.toLocaleString()}</div>
        <div class="asset-card">總資產 (含美股換算 TWD): NT$${(twTotal + usTotal*rate).toLocaleString()} <br>
        匯率: ${rate} <small>(最後更新: ${appData.lastRateDate})</small></div>
    `;
}

/* ==== 倉位頁 ==== */
let currentMarket = "US";
function switchMarket(market){
    currentMarket = market;
    renderPositions();
}

function renderPositions(){
    const container = document.getElementById("positions-container");
    const filtered = positions.filter(p=>p.market===currentMarket);
    let html = `<table class="position-table"><tr><th>代碼</th><th>名稱</th><th>股數</th><th>均價</th><th>現價</th><th>市值</th><th>操作</th></tr>`;
    filtered.forEach(p=>{
        const price = appData.prices[p.symbol] || p.currentPrice;
        const value = (price * p.shares).toFixed(2);
        html += `<tr>
            <td>${p.symbol}</td>
            <td>${p.name}</td>
            <td>${p.shares}</td>
            <td>${p.avgPrice}</td>
            <td><input type="number" value="${price}" onchange="updatePrice('${p.symbol}',this.value)"></td>
            <td>${value}</td>
            <td><button class="action-btn" onclick="selectStock('${p.symbol}')">停利計算</button></td>
        </tr>`;
    });
    html += `</table>`;
    container.innerHTML = html;
}

function updatePrice(symbol, value){
    appData.prices[symbol] = parseFloat(value);
    localStorage.setItem(storageKey, JSON.stringify(appData));
    renderPositions();
}

/* ==== 停利頁 ==== */
let selectedStock = null;
function selectStock(symbol){
    selectedStock = positions.find(p=>p.symbol===symbol);
    showPage("page-profit");
}

function renderProfit(){
    const container = document.getElementById("profit-container");
    if(!selectedStock){
        container.innerHTML = "請先從倉位頁選擇股票";
        return;
    }
    const price = appData.prices[selectedStock.symbol] || selectedStock.currentPrice;
    const halfShares = selectedStock.shares / 2;
    const realized = (price - selectedStock.avgPrice) * halfShares;
    const remainingCost = selectedStock.avgPrice * selectedStock.shares - realized;
    const maxDrop = realized / 2;
    const stopPrice = price - maxDrop/halfShares;

    container.innerHTML = `
        <h3>${selectedStock.name} (${selectedStock.symbol})</h3>
        <p>股數: ${selectedStock.shares}, 均價: ${selectedStock.avgPrice}, 現價: ${price}</p>
        <p>出一半股數: ${halfShares} 股</p>
        <p>已實現獲利: ${realized.toFixed(2)}</p>
        <p>剩餘成本: ${remainingCost.toFixed(2)}</p>
        <p>停利價 (回吐不超過一半): ${stopPrice.toFixed(2)}</p>
        <label>參考均線 X 日: <input type="number" value="20"></label>
    `;
}

/* ==== 預備金頁 ==== */
function renderCash(){
    const container = document.getElementById("cash-container");
    let basic = appData.cash.basic || 0;
    let extra = appData.cash.extra || 0;
    let future = appData.cash.future || [];

    let futureHtml = future.map((f,i)=>`<li>${f.name}: NT$${f.amount}<button onclick="removeFuture(${i})">刪除</button></li>`).join("");

    container.innerHTML = `
        <h4>生存現金</h4>
        每月基本開銷: <input type="number" value="${basic}" onchange="updateCash('basic',this.value)"> 
        <p>6個月: NT$${(basic*6)} / 9個月: NT$${(basic*9)}</p>
        <h4>加碼現金 (10~15% 股票總額)</h4>
        <p>10%: NT$${getStockTotal()*0.1} / 15%: NT$${getStockTotal()*0.15}</p>
        <h4>未來預計花費</h4>
        名稱: <input type="text" id="futureName"> 金額: <input type="number" id="futureAmount">
        <button onclick="addFuture()">新增</button>
        <ul>${futureHtml}</ul>
        <h4>預備金總額: NT$${basic + extra + future.reduce((a,f)=>a+f.amount,0)}</h4>
    `;
}

function getStockTotal(){
    let total = 0;
    positions.forEach(p=>{
        const price = appData.prices[p.symbol] || p.currentPrice;
        total += price * p.shares;
    });
    return total;
}

function updateCash(type, value){
    appData.cash[type] = parseFloat(value);
    localStorage.setItem(storageKey, JSON.stringify(appData));
    renderCash();
}

function addFuture(){
    const name = document.getElementById("futureName").value;
    const amount = parseFloat(document.getElementById("futureAmount").value);
    if(!name || isNaN(amount)) return;
    appData.cash.future.push({name, amount});
    localStorage.setItem(storageKey, JSON.stringify(appData));
    renderCash();
}

function removeFuture(i){
    appData.cash.future.splice(i,1);
    localStorage.setItem(storageKey, JSON.stringify(appData));
    renderCash();
}

/* ==== 初始化 ==== */
showPage("page-assets");
