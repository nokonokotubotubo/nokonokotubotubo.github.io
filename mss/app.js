(function(){'use strict';
const STORAGE_KEYS={ARTICLES:'minews_articles',RSS_FEEDS:'minews_rssFeeds',FOLDERS:'minews_folders',AI_LEARNING:'minews_aiLearning',WORD_FILTERS:'minews_wordFilters'};
const MAX_ARTICLES=1000,DATA_VERSION='1.0',REQUEST_TIMEOUT=15000,MAX_RETRIES=2,RETRY_DELAY=3000;
const RSS_PROXY_URLS=['https://api.codetabs.com/v1/proxy?quest=','https://api.allorigins.win/get?url=','https://thingproxy.freeboard.io/fetch/','https://corsproxy.io/?'];
const FOLDER_COLORS=[{name:'ブルー',value:'#4A90A4'},{name:'グリーン',value:'#28a745'},{name:'オレンジ',value:'#fd7e14'},{name:'パープル',value:'#6f42c1'},{name:'レッド',value:'#dc3545'},{name:'グレー',value:'#6c757d'}];

const DEFAULT_DATA={
folders:[{id:'default-general',name:'ニュース',color:'#4A90A4',createdAt:new Date().toISOString()},{id:'default-tech',name:'テック',color:'#28a745',createdAt:new Date().toISOString()}],
articles:[],
rssFeeds:[{id:'default-nhk',url:'https://www3.nhk.or.jp/rss/news/cat0.xml',title:'NHKニュース',folderId:'default-general',lastUpdated:new Date().toISOString(),isActive:true},{id:'default-itmedia',url:'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',title:'ITmedia',folderId:'default-tech',lastUpdated:new Date().toISOString(),isActive:true}],
aiLearning:{version:DATA_VERSION,wordWeights:{},categoryWeights:{Technology:0,Development:0,Business:0,Science:0,Design:0,AI:0,Web:0,Mobile:0},lastUpdated:new Date().toISOString()},
wordFilters:{interestWords:['AI','React','JavaScript','PWA','機械学習'],ngWords:[],lastUpdated:new Date().toISOString()}
};

const DataHooksCache={
articles:null,rssFeeds:null,folders:null,aiLearning:null,wordFilters:null,
lastUpdate:{articles:null,rssFeeds:null,folders:null,aiLearning:null,wordFilters:null},
clear:function(key){key?(this[key]=null,this.lastUpdate[key]=null,console.log(`[Cache] Cleared cache for: ${key}`)):(this.articles=this.rssFeeds=this.folders=this.aiLearning=this.wordFilters=null,this.lastUpdate={articles:null,rssFeeds:null,folders:null,aiLearning:null,wordFilters:null},console.log('[Cache] Cleared all cache'))},
getStats:()=>({articles:DataHooksCache.articles?'cached':'not cached',rssFeeds:DataHooksCache.rssFeeds?'cached':'not cached',folders:DataHooksCache.folders?'cached':'not cached',aiLearning:DataHooksCache.aiLearning?'cached':'not cached',wordFilters:DataHooksCache.wordFilters?'cached':'not cached'})
};

const FolderManager={
createFolder:(name,color='#4A90A4')=>({id:`folder_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,name:name.trim(),color,createdAt:new Date().toISOString()}),
validateFolder:folder=>folder&&typeof folder.name==='string'&&folder.name.trim().length>0&&folder.name.trim().length<=50,
getColorName:colorValue=>{const color=FOLDER_COLORS.find(c=>c.value===colorValue);return color?color.name:'カスタム'},
matchArticleToFeed:(article,feeds)=>{
let matchedFeed=feeds.find(feed=>feed.title===article.rssSource);
if(matchedFeed)return matchedFeed;
matchedFeed=feeds.find(feed=>article.rssSource.includes(feed.title)||feed.title.includes(article.rssSource));
if(matchedFeed)return matchedFeed;
try{matchedFeed=feeds.find(feed=>{const feedDomain=FolderManager.extractDomainFromUrl(feed.url);const articleDomain=FolderManager.extractDomainFromSource(article.rssSource);return articleDomain===feedDomain});if(matchedFeed)return matchedFeed}catch(e){console.warn('[FolderManager] Domain matching failed:',e)}
return null
},
extractDomainFromSource:source=>source.includes('.')?source.toLowerCase().replace(/^www\./,''):source.toLowerCase(),
extractDomainFromUrl:url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return''}}
};

const RSSProcessor={
fetchRSS:async function(url,proxyIndex=0,retryCount=0){
if(proxyIndex>=RSS_PROXY_URLS.length){
if(retryCount<MAX_RETRIES){console.log(`[RSS] Retrying from first proxy (attempt ${retryCount+1})`);await this.delay(RETRY_DELAY);return this.fetchRSS(url,0,retryCount+1)}
throw new Error('All proxy servers failed after retries')
}
const proxyUrl=RSS_PROXY_URLS[proxyIndex],fullUrl=proxyUrl+encodeURIComponent(url);
console.log(`[RSS] Fetching via proxy ${proxyIndex+1} (${proxyUrl.split('?')[0]}):`,url);
try{
const controller=new AbortController(),timeoutId=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT);
const response=await fetch(fullUrl,{signal:controller.signal,headers:{Accept:'*/*','User-Agent':'Mozilla/5.0 (compatible; Minews/1.0)'},mode:'cors'});
clearTimeout(timeoutId);
if(!response.ok)throw new Error(`HTTP ${response.status}: ${response.statusText}`);
let xmlContent;
if(proxyUrl.includes('allorigins.win')){const data=await response.json();xmlContent=data.contents;if(!xmlContent)throw new Error('No contents in allorigins.win response')}
else if(proxyUrl.includes('codetabs.com'))xmlContent=await response.text();
else if(proxyUrl.includes('thingproxy.freeboard.io'))xmlContent=await response.text();
else{const contentType=response.headers.get('content-type');xmlContent=contentType?.includes('application/json')?await response.json().then(data=>data.contents||data).catch(()=>response.text()):await response.text()}
if(!xmlContent||xmlContent.trim().length===0)throw new Error('Empty response content');
console.log(`[RSS] Successfully fetched via proxy ${proxyIndex+1}`);
return xmlContent
}catch(error){console.warn(`[RSS] Proxy ${proxyIndex+1} failed:`,error.message);if(error.name==='AbortError')console.warn(`[RSS] Request timeout for proxy ${proxyIndex+1}`);return this.fetchRSS(url,proxyIndex+1,retryCount)}
},
delay:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
parseRSS:function(xmlString,sourceUrl){
try{
const cleanXml=xmlString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,''),parser=new DOMParser(),xmlDoc=parser.parseFromString(cleanXml,'text/xml');
const parseError=xmlDoc.querySelector('parsererror');
if(parseError){console.error('[RSS] XML Parse Error:',parseError.textContent);throw new Error('XML parse error: '+parseError.textContent)}
const articles=[];
let feedTitle='Unknown Feed';
const rss2Items=xmlDoc.querySelectorAll('rss channel item');
if(rss2Items.length>0){
feedTitle=xmlDoc.querySelector('rss channel title')?.textContent?.trim()||feedTitle;
rss2Items.forEach((item,index)=>{if(index<20){const article=this.parseRSSItem(item,sourceUrl);if(article)articles.push(article)}})
}
const atomEntries=xmlDoc.querySelectorAll('feed entry');
if(atomEntries.length>0&&articles.length===0){
feedTitle=xmlDoc.querySelector('feed title')?.textContent?.trim()||feedTitle;
atomEntries.forEach((entry,index)=>{if(index<20){const article=this.parseAtomEntry(entry,sourceUrl);if(article)articles.push(article)}})
}
const rdfItems=xmlDoc.querySelectorAll('rdf\\:RDF item, RDF item');
if(rdfItems.length>0&&articles.length===0){
feedTitle=xmlDoc.querySelector('channel title')?.textContent?.trim()||feedTitle;
rdfItems.forEach((item,index)=>{if(index<20){const article=this.parseRSSItem(item,sourceUrl);if(article)articles.push(article)}})
}
console.log(`[RSS] Parsed ${articles.length} articles from ${feedTitle}`);
return{articles,feedTitle}
}catch(error){console.error('[RSS] Parse error:',error);throw new Error('Failed to parse RSS feed: '+error.message)}
},
parseRSSItem:function(item,sourceUrl){
try{
const title=this.getTextContent(item,['title']),link=this.getTextContent(item,['link','guid'])||item.getAttribute('rdf:about'),description=this.getTextContent(item,['description','content:encoded','content','summary']),pubDate=this.getTextContent(item,['pubDate','date']),category=this.getTextContent(item,['category','subject'])||'General';
if(!title||!link){console.warn('[RSS] Skipping item: missing title or link');return null}
const cleanDescription=description?this.cleanHtml(description).substring(0,300):'記事の概要は提供されていません',keywords=this.extractKeywords(title+' '+cleanDescription);
return{id:`rss_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,title:this.cleanHtml(title).trim(),url:link.trim(),content:cleanDescription,publishDate:this.parseDate(pubDate),rssSource:this.extractDomain(sourceUrl),category:this.cleanHtml(category).trim(),readStatus:'unread',readLater:false,userRating:0,keywords,fetchedAt:new Date().toISOString()}
}catch(error){console.error('[RSS] Error parsing RSS item:',error);return null}
},
parseAtomEntry:function(entry,sourceUrl){
try{
const title=this.getTextContent(entry,['title']),link=entry.querySelector('link')?.getAttribute('href')||this.getTextContent(entry,['id']),content=this.getTextContent(entry,['content','summary','description']),published=this.getTextContent(entry,['published','updated']),category=entry.querySelector('category')?.getAttribute('term')||entry.querySelector('category')?.textContent||'General';
if(!title||!link){console.warn('[RSS] Skipping Atom entry: missing title or link');return null}
const cleanContent=content?this.cleanHtml(content).substring(0,300):'記事の概要は提供されていません',keywords=this.extractKeywords(title+' '+cleanContent);
return{id:`atom_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,title:this.cleanHtml(title).trim(),url:link.trim(),content:cleanContent,publishDate:this.parseDate(published),rssSource:this.extractDomain(sourceUrl),category:this.cleanHtml(category).trim(),readStatus:'unread',readLater:false,userRating:0,keywords,fetchedAt:new Date().toISOString()}
}catch(error){console.error('[RSS] Error parsing Atom entry:',error);return null}
},
getTextContent:(element,selectors)=>{
for(const selector of selectors){
let result=null;
if(selector.includes(':')){
const elements=element.getElementsByTagName(selector);
if(elements.length>0&&elements[0].textContent)result=elements[0].textContent.trim();
if(!result){const localName=selector.split(':')[1],localElements=element.getElementsByTagName(localName);if(localElements.length>0&&localElements[0].textContent)result=localElements[0].textContent.trim()}
}else{try{const el=element.querySelector(selector);if(el&&el.textContent)result=el.textContent.trim()}catch{const elements=element.getElementsByTagName(selector);if(elements.length>0&&elements[0].textContent)result=elements[0].textContent.trim()}}
if(result)return result
}return null
},
cleanHtml:html=>html?html.replace(/<[^>]*>/g,'').replace(/</g,'<').replace(/>/g,'>').replace(/&/g,'&').replace(/"/g,'"').replace(/'/g,"'").replace(/\s+/g,' ').trim():'',
parseDate:dateString=>{if(!dateString)return new Date().toISOString();try{const date=new Date(dateString);return isNaN(date.getTime())?new Date().toISOString():date.toISOString()}catch{return new Date().toISOString()}},
extractKeywords:text=>{
const stopWords=['the','a','an','and','or','but','in','on','at','to','for','of','with','by','は','が','を','に','で','と','の','から','まで','について','という','など'];
return[...new Set(text.toLowerCase().replace(/[^\w\sぁ-んァ-ン一-龯]/g,' ').split(/\s+/).filter(word=>word.length>2&&!stopWords.includes(word)).slice(0,8))]
},
extractDomain:url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return'Unknown Source'}}
};

const AIScoring={
calculateScore:(article,aiLearning,wordFilters)=>{
let score=0;
const ageInDays=(Date.now()-new Date(article.publishDate).getTime())/(1000*60*60*24);
score+=Math.max(0,10-ageInDays);
if(article.keywords&&aiLearning.wordWeights)article.keywords.forEach(keyword=>score+=(aiLearning.wordWeights[keyword]||0));
if(article.category&&aiLearning.categoryWeights)score+=(aiLearning.categoryWeights[article.category]||0);
if(wordFilters.interestWords&&article.title)wordFilters.interestWords.forEach(word=>{if(article.title.toLowerCase().includes(word.toLowerCase())||article.content.toLowerCase().includes(word.toLowerCase()))score+=20});
if(wordFilters.ngWords&&article.title)wordFilters.ngWords.forEach(word=>{if(article.title.toLowerCase().includes(word.toLowerCase())||article.content.toLowerCase().includes(word.toLowerCase()))score-=50});
if(article.userRating>0)score+=(article.userRating-3)*10;
return Math.round(score)
},
updateLearning:(article,rating,aiLearning,isRevert=false)=>{
const weights=[0,-30,-15,0,15,30];
let weight=weights[rating]||0;
if(isRevert)weight=-weight;
if(article.keywords)article.keywords.forEach(keyword=>aiLearning.wordWeights[keyword]=(aiLearning.wordWeights[keyword]||0)+weight);
if(article.category)aiLearning.categoryWeights[article.category]=(aiLearning.categoryWeights[article.category]||0)+weight;
aiLearning.lastUpdated=new Date().toISOString();
isRevert?console.log(`[AI] Learning reverted for rating ${rating}, weight: ${weight}`):console.log(`[AI] Learning updated for rating ${rating}, weight: ${weight}`);
return aiLearning
},
sortArticlesByScore:(articles,aiLearning,wordFilters)=>articles.map(article=>({...article,aiScore:AIScoring.calculateScore(article,aiLearning,wordFilters)})).sort((a,b)=>a.aiScore!==b.aiScore?b.aiScore-a.aiScore:a.userRating!==b.userRating?b.userRating-a.userRating:new Date(b.publishDate)-new Date(a.publishDate))
};

const WordFilterManager={
addWord:(word,type,wordFilters)=>{
word=word.trim().toLowerCase();
if(!word)return false;
if(type==='interest'){if(!wordFilters.interestWords.includes(word)){wordFilters.interestWords.push(word);wordFilters.lastUpdated=new Date().toISOString();console.log('[WordFilter] Added interest word:',word);return true}}
else if(type==='ng'){if(!wordFilters.ngWords.includes(word)){wordFilters.ngWords.push(word);wordFilters.lastUpdated=new Date().toISOString();console.log('[WordFilter] Added NG word:',word);return true}}
return false
},
removeWord:(word,type,wordFilters)=>{
word=word.trim().toLowerCase();
if(type==='interest'){const index=wordFilters.interestWords.indexOf(word);if(index>-1){wordFilters.interestWords.splice(index,1);wordFilters.lastUpdated=new Date().toISOString();console.log('[WordFilter] Removed interest word:',word);return true}}
else if(type==='ng'){const index=wordFilters.ngWords.indexOf(word);if(index>-1){wordFilters.ngWords.splice(index,1);wordFilters.lastUpdated=new Date().toISOString();console.log('[WordFilter] Removed NG word:',word);return true}}
return false
},
filterArticles:(articles,wordFilters)=>wordFilters.ngWords.length?articles.filter(article=>!wordFilters.ngWords.some(ngWord=>(article.title+' '+article.content).toLowerCase().includes(ngWord.toLowerCase()))):articles
};

const LocalStorageManager={
setItem:(key,data)=>{try{const serializedData=JSON.stringify({data,timestamp:new Date().toISOString(),version:DATA_VERSION});localStorage.setItem(key,serializedData);console.log('[Storage] Saved:',key,'Size:',serializedData.length);return true}catch(error){console.error('[Storage] Save failed:',key,error);return false}},
getItem:(key,defaultValue)=>{try{const stored=localStorage.getItem(key);if(!stored){if(defaultValue){this.setItem(key,defaultValue);console.log('[Storage] Initialized with default for:',key)}return defaultValue}const parsed=JSON.parse(stored);if(parsed.version!==DATA_VERSION){console.warn('[Storage] Version mismatch:',key,'Migrating data');return this.migrateData(key,parsed,defaultValue)}console.log('[Storage] Loaded:',key,'Timestamp:',parsed.timestamp);return parsed.data}catch(error){console.error('[Storage] Load failed:',key,error);if(defaultValue)this.setItem(key,defaultValue);return defaultValue}},
removeItem:key=>{try{localStorage.removeItem(key);console.log('[Storage] Removed:',key);return true}catch(error){console.error('[Storage] Remove failed:',key,error);return false}},
migrateData:(key,oldData,defaultValue)=>{console.log('[Storage] Migrating data for:',key);if(oldData.data){LocalStorageManager.setItem(key,oldData.data);return oldData.data}return defaultValue},
getStorageInfo:()=>{let totalSize=0,itemCount=0;for(let key in localStorage){if(localStorage.hasOwnProperty(key)&&key.startsWith('minews_')){totalSize+=localStorage[key].length;itemCount++}}return{totalSize,itemCount,available:5000000-totalSize}}
};

const DataHooks={
useArticles:()=>{
const stored=localStorage.getItem(STORAGE_KEYS.ARTICLES),timestamp=stored?JSON.parse(stored).timestamp:null;
if(!DataHooksCache.articles||DataHooksCache.lastUpdate.articles!==timestamp){DataHooksCache.articles=LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES,DEFAULT_DATA.articles);DataHooksCache.lastUpdate.articles=timestamp;console.log('[Cache] Articles cache updated')}
return{
articles:DataHooksCache.articles,
addArticle:newArticle=>{
const updatedArticles=[...DataHooksCache.articles];
if(updatedArticles.find(article=>article.id===newArticle.id||article.url===newArticle.url||(article.title===newArticle.title&&article.rssSource===newArticle.rssSource))){console.warn('[Articles] Duplicate article:',newArticle.title);return false}
if(updatedArticles.length>=MAX_ARTICLES){updatedArticles.sort((a,b)=>{const aScore=(a.readStatus==='read'&&a.userRating===0)?1:0,bScore=(b.readStatus==='read'&&b.userRating===0)?1:0;return aScore!==bScore?bScore-aScore:new Date(a.publishDate)-new Date(b.publishDate)});updatedArticles.pop();console.log('[Articles] Removed old article for capacity')}
updatedArticles.unshift(newArticle);LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES,updatedArticles);DataHooksCache.articles=updatedArticles;DataHooksCache.lastUpdate.articles=new Date().toISOString();state.articles=updatedArticles;return true
},
updateArticle:(articleId,updates)=>{
const updatedArticles=DataHooksCache.articles.map(article=>article.id===articleId?{...article,...updates}:article);
LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES,updatedArticles);DataHooksCache.articles=updatedArticles;DataHooksCache.lastUpdate.articles=new Date().toISOString();state.articles=updatedArticles;render()
},
removeArticle:articleId=>{
const updatedArticles=DataHooksCache.articles.filter(article=>article.id!==articleId);
LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES,updatedArticles);DataHooksCache.articles=updatedArticles;DataHooksCache.lastUpdate.articles=new Date().toISOString();state.articles=updatedArticles;render()
},
bulkUpdateArticles:(articleIds,updates)=>{
const updatedArticles=DataHooksCache.articles.map(article=>articleIds.includes(article.id)?{...article,...updates}:article);
LocalStorageManager.setItem(STORAGE_KEYS.ARTICLES,updatedArticles);DataHooksCache.articles=updatedArticles;DataHooksCache.lastUpdate.articles=new Date().toISOString();state.articles=updatedArticles;render()
}
}
},
useRSSManager:()=>{
const stored=localStorage.getItem(STORAGE_KEYS.RSS_FEEDS),timestamp=stored?JSON.parse(stored).timestamp:null;
if(!DataHooksCache.rssFeeds||DataHooksCache.lastUpdate.rssFeeds!==timestamp){DataHooksCache.rssFeeds=LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS,DEFAULT_DATA.rssFeeds);DataHooksCache.lastUpdate.rssFeeds=timestamp;console.log('[Cache] RSS feeds cache updated')}
return{
rssFeeds:DataHooksCache.rssFeeds,
addRSSFeed:(url,title,folderId='uncategorized')=>{
const newFeed={id:`rss_${Date.now()}`,url,title:title||'Unknown Feed',folderId,lastUpdated:new Date().toISOString(),isActive:true};
const updatedFeeds=[...DataHooksCache.rssFeeds,newFeed];
LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS,updatedFeeds);DataHooksCache.rssFeeds=updatedFeeds;DataHooksCache.lastUpdate.rssFeeds=new Date().toISOString();console.log('[RSS] Added feed:',title);return newFeed
},
removeRSSFeed:feedId=>{
const updatedFeeds=DataHooksCache.rssFeeds.filter(feed=>feed.id!==feedId);
LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS,updatedFeeds);DataHooksCache.rssFeeds=updatedFeeds;DataHooksCache.lastUpdate.rssFeeds=new Date().toISOString();console.log('[RSS] Removed feed:',feedId)
},
updateRSSFeed:(feedId,updates)=>{
const updatedFeeds=DataHooksCache.rssFeeds.map(feed=>feed.id===feedId?{...feed,...updates}:feed);
LocalStorageManager.setItem(STORAGE_KEYS.RSS_FEEDS,updatedFeeds);DataHooksCache.rssFeeds=updatedFeeds;DataHooksCache.lastUpdate.rssFeeds=new Date().toISOString();console.log('[RSS] Updated feed:',feedId)
},
fetchAllFeeds:async function(){
const articlesHook=DataHooks.useArticles();
let totalAdded=0,totalErrors=0,feedResults=[];
for(const feed of DataHooksCache.rssFeeds.filter(f=>f.isActive)){
try{
console.log(`[RSS] Fetching feed: ${feed.title} (${feed.url})`);
const rssContent=await RSSProcessor.fetchRSS(feed.url),parsed=RSSProcessor.parseRSS(rssContent,feed.url);
let addedCount=0;
parsed.articles.forEach(article=>{if(articlesHook.addArticle(article))addedCount++});
this.updateRSSFeed(feed.id,{lastUpdated:new Date().toISOString(),title:parsed.feedTitle});
totalAdded+=addedCount;feedResults.push({name:feed.title,success:true,added:addedCount,total:parsed.articles.length});
console.log(`[RSS] Added ${addedCount} articles from ${feed.title}`)
}catch(error){console.error(`[RSS] Failed to fetch ${feed.title}:`,error.message);totalErrors++;feedResults.push({name:feed.title,success:false,error:error.message})}
}
return{totalAdded,totalErrors,totalFeeds:DataHooksCache.rssFeeds.filter(f=>f.isActive).length,feedResults}
}
}
},
useFolders:()=>{
const stored=localStorage.getItem(STORAGE_KEYS.FOLDERS),timestamp=stored?JSON.parse(stored).timestamp:null;
if(!DataHooksCache.folders||DataHooksCache.lastUpdate.folders!==timestamp){DataHooksCache.folders=LocalStorageManager.getItem(STORAGE_KEYS.FOLDERS,DEFAULT_DATA.folders);DataHooksCache.lastUpdate.folders=timestamp;console.log('[Cache] Folders cache updated')}
return{
folders:DataHooksCache.folders,
addFolder:(name,color)=>{
const newFolder=FolderManager.createFolder(name,color);
if(!FolderManager.validateFolder(newFolder))return null;
const updatedFolders=[...DataHooksCache.folders,newFolder];
LocalStorageManager.setItem(STORAGE_KEYS.FOLDERS,updatedFolders);DataHooksCache.folders=updatedFolders;DataHooksCache.lastUpdate.folders=new Date().toISOString();console.log('[Folder] Added folder:',name);return newFolder
},
removeFolder:folderId=>{
const rssHook=DataHooks.useRSSManager(),feedsInFolder=rssHook.rssFeeds.filter(feed=>feed.folderId===folderId);
if(feedsInFolder.length>0)return{success:false,reason:'FEEDS_EXIST',feedCount:feedsInFolder.length};
const updatedFolders=DataHooksCache.folders.filter(folder=>folder.id!==folderId);
LocalStorageManager.setItem(STORAGE_KEYS.FOLDERS,updatedFolders);DataHooksCache.folders=updatedFolders;DataHooksCache.lastUpdate.folders=new Date().toISOString();console.log('[Folder] Removed folder:',folderId);return{success:true}
},
updateFolder:(folderId,updates)=>{
const updatedFolders=DataHooksCache.folders.map(folder=>folder.id===folderId?{...folder,...updates}:folder);
LocalStorageManager.setItem(STORAGE_KEYS.FOLDERS,updatedFolders);DataHooksCache.folders=updatedFolders;DataHooksCache.lastUpdate.folders=new Date().toISOString();console.log('[Folder] Updated folder:',folderId)
}
}
},
useAILearning:()=>{
const stored=localStorage.getItem(STORAGE_KEYS.AI_LEARNING),timestamp=stored?JSON.parse(stored).timestamp:null;
if(!DataHooksCache.aiLearning||DataHooksCache.lastUpdate.aiLearning!==timestamp){DataHooksCache.aiLearning=LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING,DEFAULT_DATA.aiLearning);DataHooksCache.lastUpdate.aiLearning=timestamp;console.log('[Cache] AI learning cache updated')}
return{
aiLearning:DataHooksCache.aiLearning,
updateWordWeight:(word,weight)=>{
const updatedLearning={...DataHooksCache.aiLearning,wordWeights:{...DataHooksCache.aiLearning.wordWeights,[word]:(DataHooksCache.aiLearning.wordWeights[word]||0)+weight},lastUpdated:new Date().toISOString()};
LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING,updatedLearning);DataHooksCache.aiLearning=updatedLearning;DataHooksCache.lastUpdate.aiLearning=new Date().toISOString();console.log('[AI] Updated word weight:',word,weight)
},
updateCategoryWeight:(category,weight)=>{
const updatedLearning={...DataHooksCache.aiLearning,categoryWeights:{...DataHooksCache.aiLearning.categoryWeights,[category]:(DataHooksCache.aiLearning.categoryWeights[category]||0)+weight},lastUpdated:new Date().toISOString()};
LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING,updatedLearning);DataHooksCache.aiLearning=updatedLearning;DataHooksCache.lastUpdate.aiLearning=new Date().toISOString();console.log('[AI] Updated category weight:',category,weight)
},
updateLearningData:(article,rating,isRevert=false)=>{
const updatedLearning=AIScoring.updateLearning(article,rating,DataHooksCache.aiLearning,isRevert);
LocalStorageManager.setItem(STORAGE_KEYS.AI_LEARNING,updatedLearning);DataHooksCache.aiLearning=updatedLearning;DataHooksCache.lastUpdate.aiLearning=new Date().toISOString();return updatedLearning
}
}
},
useWordFilters:()=>{
const stored=localStorage.getItem(STORAGE_KEYS.WORD_FILTERS),timestamp=stored?JSON.parse(stored).timestamp:null;
if(!DataHooksCache.wordFilters||DataHooksCache.lastUpdate.wordFilters!==timestamp){DataHooksCache.wordFilters=LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS,DEFAULT_DATA.wordFilters);DataHooksCache.lastUpdate.wordFilters=timestamp;console.log('[Cache] Word filters cache updated')}
return{
wordFilters:DataHooksCache.wordFilters,
addInterestWord:word=>{
const updated={...DataHooksCache.wordFilters};
if(WordFilterManager.addWord(word,'interest',updated)){LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS,updated);DataHooksCache.wordFilters=updated;DataHooksCache.lastUpdate.wordFilters=new Date().toISOString();return true}
return false
},
addNGWord:word=>{
const updated={...DataHooksCache.wordFilters};
if(WordFilterManager.addWord(word,'ng',updated)){LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS,updated);DataHooksCache.wordFilters=updated;DataHooksCache.lastUpdate.wordFilters=new Date().toISOString();return true}
return false
},
removeInterestWord:word=>{
const updated={...DataHooksCache.wordFilters};
if(WordFilterManager.removeWord(word,'interest',updated)){LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS,updated);DataHooksCache.wordFilters=updated;DataHooksCache.lastUpdate.wordFilters=new Date().toISOString();return true}
return false
},
removeNGWord:word=>{
const updated={...DataHooksCache.wordFilters};
if(WordFilterManager.removeWord(word,'ng',updated)){LocalStorageManager.setItem(STORAGE_KEYS.WORD_FILTERS,updated);DataHooksCache.wordFilters=updated;DataHooksCache.lastUpdate.wordFilters=new Date().toISOString();return true}
return false
}
}
}
};

let state={viewMode:'all',selectedFolder:'all',showModal:null,articles:[],isLoading:false,lastUpdate:null};
const setState=newState=>{state={...state,...newState};render()};

function initializeData(){
console.log('[App] Initializing data...');
const articlesData=LocalStorageManager.getItem(STORAGE_KEYS.ARTICLES,DEFAULT_DATA.articles);
const rssData=LocalStorageManager.getItem(STORAGE_KEYS.RSS_FEEDS,DEFAULT_DATA.rssFeeds);
const foldersData=LocalStorageManager.getItem(STORAGE_KEYS.FOLDERS,DEFAULT_DATA.folders);
const aiData=LocalStorageManager.getItem(STORAGE_KEYS.AI_LEARNING,DEFAULT_DATA.aiLearning);
const wordData=LocalStorageManager.getItem(STORAGE_KEYS.WORD_FILTERS,DEFAULT_DATA.wordFilters);
DataHooksCache.articles=articlesData;DataHooksCache.rssFeeds=rssData;DataHooksCache.folders=foldersData;DataHooksCache.aiLearning=aiData;DataHooksCache.wordFilters=wordData;
state.articles=articlesData;
if(state.articles.length===0){
console.log('[App] No existing articles, adding samples');
const sampleArticles=[{id:'sample_1',title:'Minews PWA：フォルダ機能追加完了',url:'#',content:'RSSフィードをフォルダで分類管理し、記事表示もフォルダでフィルタリングできる機能を追加しました。リスト選択モーダルによりユーザビリティも向上。',publishDate:new Date().toISOString(),rssSource:'NHKニュース',category:'Design',readStatus:'unread',readLater:false,userRating:0,keywords:['フォルダ','RSS','リスト選択','機能追加']},{id:'sample_2',title:'フォルダ管理で記事整理が便利に',url:'#',content:'ニュース、テック、ブログなど用途別にRSSフィードを分類。記事表示もフォルダ単位でフィルタリングでき、情報収集効率が大幅向上。',publishDate:new Date(Date.now()-3600000).toISOString(),rssSource:'ITmedia',category:'UX',readStatus:'unread',readLater:false,userRating:0,keywords:['フォルダ管理','記事整理','分類','フィルタリング','効率化']}];
const articlesHook=DataHooks.useArticles();sampleArticles.forEach(article=>articlesHook.addArticle(article));state.articles=DataHooksCache.articles
}
const storageInfo=LocalStorageManager.getStorageInfo();
console.log('[App] Storage info:',storageInfo);
console.log('[App] Data initialization complete. Articles:',state.articles.length);
console.log('[App] RSS Feeds:',DataHooksCache.rssFeeds.length);
console.log('[App] Folders:',DataHooksCache.folders.length);
console.log('[App] Cache initialized:',DataHooksCache.getStats());
}

function formatDate(dateString){const date=new Date(dateString),now=new Date(),diffTime=now-date,diffDays=Math.floor(diffTime/(1000*60*60*24)),diffHours=Math.floor(diffTime/(1000*60*60));return diffHours<1?'1時間以内':diffHours<24?diffHours+'時間前':diffDays===1?'昨日':diffDays<7?diffDays+'日前':date.toLocaleDateString('ja-JP')}

function createStarRating(rating,articleId){let stars='';for(let i=1;i<=5;i++){const filled=i<=rating?'filled':'';stars+=`<span class="star ${filled}" data-rating="${i}" data-article-id="${articleId}">★</span>`}return `<div class="star-rating">${stars}</div>`}

function truncateText(text,maxLength=200){return text.length<=maxLength?text:text.substring(0,maxLength).trim()+'...'}

function handleFilterClick(mode){setState({viewMode:mode})}
function handleFolderFilterClick(folderId){setState({selectedFolder:folderId})}
function handleModalOpen(modalType){setState({showModal:modalType})}
function handleModalClose(){setState({showModal:null})}

function handleStarClick(event){
if(event.target.classList.contains('star')){
const rating=parseInt(event.target.dataset.rating),articleId=event.target.dataset.articleId,articlesHook=DataHooks.useArticles(),aiHook=DataHooks.useAILearning(),article=state.articles.find(a=>a.id===articleId);
if(article){
if(article.userRating===rating){console.log(`[Rating] Article "${article.title}" already has ${rating} stars. No change needed.`);return}
if(article.userRating>0){aiHook.updateLearningData(article,article.userRating,true);console.log(`[AI] Reverted previous rating (${article.userRating} stars) for article "${article.title}"`)}
const updateData={userRating:rating};
if(rating===1||rating===2){updateData.readStatus='read';console.log(`[Rating] Low rating (${rating} stars) - marking article as read`)}
articlesHook.updateArticle(articleId,updateData);aiHook.updateLearningData(article,rating);
article.userRating>0?console.log(`[Rating] Article "${article.title}" rating changed from ${article.userRating} to ${rating} stars`):console.log(`[Rating] Article "${article.title}" rated ${rating} stars`)
}
}
}

function handleReadStatusToggle(articleId){
const articlesHook=DataHooks.useArticles(),article=state.articles.find(a=>a.id===articleId);
if(article){const newStatus=article.readStatus==='read'?'unread':'read';articlesHook.updateArticle(articleId,{readStatus:newStatus});console.log(`[ReadStatus] Article "${article.title}" marked as ${newStatus}`)}
}

function handleReadLaterToggle(articleId){
const articlesHook=DataHooks.useArticles(),article=state.articles.find(a=>a.id===articleId);
if(article){const newReadLater=!article.readLater;articlesHook.updateArticle(articleId,{readLater:newReadLater});console.log(`[ReadLater] Article "${article.title}" read later: ${newReadLater}`)}
}

async function handleRefresh(){
if(state.isLoading)return;
setState({isLoading:true});console.log('[App] Refreshing RSS feeds...');
try{
const rssHook=DataHooks.useRSSManager(),result=await rssHook.fetchAllFeeds();
setState({isLoading:false,lastUpdate:new Date().toISOString()});
let message=`更新完了！${result.totalAdded}件の新記事を追加しました。\n`;
if(result.feedResults&&result.feedResults.length>0){message+='\n【フィード別結果】\n';result.feedResults.forEach(feedResult=>{feedResult.success?message+=`✅ ${feedResult.name}: ${feedResult.added}/${feedResult.total}件追加\n`:message+=`❌ ${feedResult.name}: 取得失敗\n`})}
if(result.totalErrors>0)message+=`\n${result.totalErrors}件のフィードで取得エラーが発生しました。`;
alert(message);console.log('[App] Refresh completed:',result)
}catch(error){setState({isLoading:false});console.error('[App] Refresh failed:',error);alert('記事の更新に失敗しました: '+error.message)}
}

function handleRSSAdd(){
const url=prompt('RSSフィードのURLを入力してください:');
if(!url)return;
showFolderSelectionModal(function(selectedFolderId){
const rssHook=DataHooks.useRSSManager(),tempFeed=rssHook.addRSSFeed(url,'フィード取得中...',selectedFolderId);
fetchFeedTitleAndUpdate(tempFeed.id,url);
if(state.showModal==='rss')render();
console.log('[RSS] RSS feed added, fetching title:',url,'to folder:',selectedFolderId)
})
}

async function fetchFeedTitleAndUpdate(feedId,url){
try{
console.log('[RSS] Fetching feed title for:',url);
const rssContent=await RSSProcessor.fetchRSS(url),parsed=RSSProcessor.parseRSS(rssContent,url),rssHook=DataHooks.useRSSManager();
rssHook.updateRSSFeed(feedId,{title:parsed.feedTitle||'タイトル不明',lastUpdated:new Date().toISOString()});
if(state.showModal==='rss')render();
console.log('[RSS] Feed title updated:',parsed.feedTitle)
}catch(error){
console.error('[RSS] Failed to fetch feed title:',error);
const rssHook=DataHooks.useRSSManager();
rssHook.updateRSSFeed(feedId,{title:`フィード（${new URL(url).hostname}）`,lastUpdated:new Date().toISOString()});
if(state.showModal==='rss')render()
}
}

function handleRSSEdit(feedId,field,currentValue){
const rssHook=DataHooks.useRSSManager(),foldersHook=DataHooks.useFolders();
if(field==='title'){const newTitle=prompt('新しいタイトルを入力してください:',currentValue);if(newTitle&&newTitle.trim()!==currentValue){rssHook.updateRSSFeed(feedId,{title:newTitle.trim()});if(state.showModal==='rss')render();console.log('[RSS] Feed title updated:',feedId,newTitle)}}
else if(field==='url'){const newUrl=prompt('新しいURLを入力してください:',currentValue);if(newUrl&&newUrl.trim()!==currentValue){rssHook.updateRSSFeed(feedId,{url:newUrl.trim()});if(state.showModal==='rss')render();console.log('[RSS] Feed URL updated:',feedId,newUrl)}}
else if(field==='folder'){showFolderSelectionModal(function(selectedFolderId){rssHook.updateRSSFeed(feedId,{folderId:selectedFolderId});if(state.showModal==='rss')render();console.log('[RSS] Feed folder updated:',feedId,selectedFolderId)})}
}

function handleFolderAdd(){
const name=prompt('フォルダ名を入力してください:');
if(!name||name.trim().length===0)return;
if(name.trim().length>50){alert('フォルダ名は50文字以内で入力してください');return}
showColorSelectionModal(function(selectedColor){
const foldersHook=DataHooks.useFolders(),newFolder=foldersHook.addFolder(name.trim(),selectedColor);
if(newFolder){if(state.showModal==='folders')render();console.log('[Folder] Added folder:',name)}else alert('フォルダの作成に失敗しました')
})
}

function showFolderSelectionModal(callback){
const foldersHook=DataHooks.useFolders(),folderOptions=[{id:'uncategorized',name:'未分類',color:'#6c757d'},...foldersHook.folders],modalId=`folder-selection-modal-${Date.now()}-${Math.floor(Math.random()*1000)}`;
document.querySelectorAll('[id^="folder-selection-modal-"]').forEach(modal=>modal.remove());
const modalHtml=`<div class="modal-overlay" id="${modalId}"><div class="modal"><div class="modal-header"><h2>フォルダを選択</h2><button type="button" class="modal-close">&times;</button></div><div class="modal-body"><div class="folder-selection-list">${folderOptions.map(folder=>`<div class="folder-selection-item" data-folder-id="${folder.id}" style="border-left: 4px solid ${folder.color}"><strong>${folder.name}</strong></div>`).join('')}</div></div></div></div>`;
document.body.insertAdjacentHTML('beforeend',modalHtml);
const modalElement=document.getElementById(modalId);
modalElement.querySelector('.modal-close').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();modalElement.remove();console.log('[Modal] Folder selection modal closed via close button')});
modalElement.querySelectorAll('.folder-selection-item').forEach(item=>{
item.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();const folderId=this.dataset.folderId;modalElement.remove();callback(folderId);console.log('[Modal] Folder selected:',folderId)});
item.addEventListener('mouseenter',function(){this.style.borderColor='#4A90A4';this.style.background='#E3F4F7'});
item.addEventListener('mouseleave',function(){this.style.borderColor='#e9ecef';this.style.background='white'})
});
modalElement.addEventListener('click',function(e){if(e.target===modalElement){modalElement.remove();console.log('[Modal] Folder selection modal closed via overlay click')}});
console.log('[Modal] Folder selection modal opened with',folderOptions.length,'options')
}

function showColorSelectionModal(callback){
const modalId=`color-selection-modal-${Date.now()}-${Math.floor(Math.random()*1000)}`;
document.querySelectorAll('[id^="color-selection-modal-"]').forEach(modal=>modal.remove());
const modalHtml=`<div class="modal-overlay" id="${modalId}"><div class="modal"><div class="modal-header"><h2>カラーを選択</h2><button type="button" class="modal-close">&times;</button></div><div class="modal-body"><div class="color-selection-list">${FOLDER_COLORS.map(color=>`<div class="color-selection-item" data-color-value="${color.value}" style="border-left: 4px solid ${color.value}"><strong>${color.name}</strong></div>`).join('')}</div></div></div></div>`;
document.body.insertAdjacentHTML('beforeend',modalHtml);
const modalElement=document.getElementById(modalId);
modalElement.querySelector('.modal-close').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();modalElement.remove();console.log('[Modal] Color selection modal closed via close button')});
modalElement.querySelectorAll('.color-selection-item').forEach(item=>{
item.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();const colorValue=this.dataset.colorValue;modalElement.remove();callback(colorValue);console.log('[Modal] Color selected:',colorValue)});
item.addEventListener('mouseenter',function(){this.style.borderColor='#4A90A4';this.style.background='#E3F4F7'});
item.addEventListener('mouseleave',function(){this.style.borderColor='#e9ecef';this.style.background='white'})
});
modalElement.addEventListener('click',function(e){if(e.target===modalElement){modalElement.remove();console.log('[Modal] Color selection modal closed via overlay click')}});
console.log('[Modal] Color selection modal opened with',FOLDER_COLORS.length,'colors')
}

function handleRSSRemove(feedId){
if(!confirm('このRSSフィードを削除しますか？'))return;
const rssHook=DataHooks.useRSSManager();rssHook.removeRSSFeed(feedId);
if(state.showModal==='rss')render();
console.log('[RSS] RSS feed removed:',feedId)
}

function handleWordAdd(type){
const word=prompt(type==='interest'?'気になるワードを入力してください:':'NGワードを入力してください:');
if(!word)return;
const wordHook=DataHooks.useWordFilters(),success=type==='interest'?wordHook.addInterestWord(word):wordHook.addNGWord(word);
if(success){if(state.showModal==='words')render();console.log(`[WordFilter] Added ${type} word:`,word)}else alert('このワードは既に登録されています')
}

function handleWordRemove(word,type){
if(!confirm(`「${word}」を削除しますか？`))return;
const wordHook=DataHooks.useWordFilters(),success=type==='interest'?wordHook.removeInterestWord(word):wordHook.removeNGWord(word);
if(success){if(state.showModal==='words')render();console.log(`[WordFilter] Removed ${type} word:`,word)}
}

function handleFolderRemove(folderId){
const foldersHook=DataHooks.useFolders(),folder=foldersHook.folders.find(f=>f.id===folderId);
if(!folder)return;
if(!confirm(`フォルダ「${folder.name}」を削除しますか？`))return;
const result=foldersHook.removeFolder(folderId);
if(result.success){
if(state.selectedFolder===folderId)setState({selectedFolder:'all'});
if(state.showModal==='folders')render();
console.log('[Folder] Removed folder:',folderId)
}else if(result.reason==='FEEDS_EXIST'){
if(confirm(`このフォルダには${result.feedCount}件のRSSフィードが含まれています。\nフィードを「未分類」に移動してからフォルダを削除しますか？`)){
const rssHook=DataHooks.useRSSManager(),feedsToMove=rssHook.rssFeeds.filter(feed=>feed.folderId===folderId);
feedsToMove.forEach(feed=>rssHook.updateRSSFeed(feed.id,{folderId:'uncategorized'}));
const retryResult=foldersHook.removeFolder(folderId);
if(retryResult.success){
if(state.selectedFolder===folderId)setState({selectedFolder:'all'});
if(state.showModal==='folders')render();
alert(`${feedsToMove.length}件のフィードを「未分類」に移動し、フォルダを削除しました`)
}
}
}
}

function handleRSSMoveFolderChange(feedId,newFolderId){
const rssHook=DataHooks.useRSSManager();rssHook.updateRSSFeed(feedId,{folderId:newFolderId});
if(state.showModal==='rss')render();
console.log('[RSS] Moved feed to folder:',feedId,newFolderId)
}

function getFilteredArticles(){
const aiHook=DataHooks.useAILearning(),wordHook=DataHooks.useWordFilters(),rssHook=DataHooks.useRSSManager();
console.log('[Debug] Filtering articles:',{totalArticles:state.articles.length,viewMode:state.viewMode,selectedFolder:state.selectedFolder,cacheStats:DataHooksCache.getStats()});
const filteredByWords=WordFilterManager.filterArticles(state.articles,wordHook.wordFilters);
let filteredByFolder=filteredByWords;
if(state.selectedFolder!=='all'){
if(state.selectedFolder==='uncategorized'){const uncategorizedFeeds=rssHook.rssFeeds.filter(feed=>!feed.folderId||feed.folderId==='uncategorized');filteredByFolder=filteredByWords.filter(article=>uncategorizedFeeds.some(feed=>FolderManager.matchArticleToFeed(article,[feed])!==null))}
else{const folderFeeds=rssHook.rssFeeds.filter(feed=>feed.folderId===state.selectedFolder);filteredByFolder=filteredByWords.filter(article=>folderFeeds.some(feed=>FolderManager.matchArticleToFeed(article,[feed])!==null))}
}
let filteredByMode;
switch(state.viewMode){
case'unread':filteredByMode=filteredByFolder.filter(article=>article.readStatus==='unread');break;
case'read':filteredByMode=filteredByFolder.filter(article=>article.readStatus==='read');break;
case'readLater':filteredByMode=filteredByFolder.filter(article=>article.readLater);break;
default:filteredByMode=filteredByFolder
}
const result=AIScoring.sortArticlesByScore(filteredByMode,aiHook.aiLearning,wordHook.wordFilters);
console.log('[Debug] Final filtered articles:',result.length);return result
}

function renderNavigation(){
const modes=[{key:'all',label:'すべて'},{key:'unread',label:'未読'},{key:'read',label:'既読'},{key:'readLater',label:'後で読む'}];
const foldersHook=DataHooks.useFolders(),folderOptions=[{id:'all',name:'すべて',color:'#4A90A4'},{id:'uncategorized',name:'未分類',color:'#6c757d'},...foldersHook.folders];
const refreshButtonClass=state.isLoading?'action-btn refresh-btn loading':'action-btn refresh-btn',refreshButtonText=state.isLoading?'🔄 更新中...':'🔄 更新';
return`<nav class="nav"><div class="nav-left"><h1>Minews</h1>${state.lastUpdate?`<span class="last-update">最終更新: ${formatDate(state.lastUpdate)}</span>`:''}</div><div class="nav-filters"><div class="filter-group"><label>表示:</label><select class="filter-select" onchange="handleFilterChange(this.value)">${modes.map(mode=>`<option value="${mode.key}"${state.viewMode===mode.key?' selected':''}>${mode.label}</option>`).join('')}</select></div><div class="filter-group"><label>フォルダ:</label><select class="filter-select" onchange="handleFolderChange(this.value)">${folderOptions.map(folder=>`<option value="${folder.id}"${state.selectedFolder===folder.id?' selected':''}>${folder.name}</option>`).join('')}</select></div></div><div class="nav-actions"><button class="${refreshButtonClass}" onclick="handleRefresh()" ${state.isLoading?'disabled':''}>${refreshButtonText}</button><button class="action-btn" onclick="handleModalOpen('rss')">📡 RSS管理</button><button class="action-btn" onclick="handleModalOpen('folders')">📁 フォルダ</button><button class="action-btn" onclick="handleModalOpen('words')">🔤 ワード管理</button></div></nav>`
}

function handleFilterChange(mode){setState({viewMode:mode})}
function handleFolderChange(folderId){setState({selectedFolder:folderId})}

function getFilteredArticleCount(viewMode,folderId){
const wordHook=DataHooks.useWordFilters(),rssHook=DataHooks.useRSSManager(),filteredByWords=WordFilterManager.filterArticles(state.articles,wordHook.wordFilters);
let filteredByFolder=filteredByWords;
if(folderId&&folderId!=='all'){
if(folderId==='uncategorized'){const uncategorizedFeeds=rssHook.rssFeeds.filter(feed=>!feed.folderId||feed.folderId==='uncategorized');filteredByFolder=filteredByWords.filter(article=>uncategorizedFeeds.some(feed=>FolderManager.matchArticleToFeed(article,[feed])!==null))}
else{const folderFeeds=rssHook.rssFeeds.filter(feed=>feed.folderId===folderId);filteredByFolder=filteredByWords.filter(article=>folderFeeds.some(feed=>FolderManager.matchArticleToFeed(article,[feed])!==null))}
}
switch(viewMode){
case'unread':return filteredByFolder.filter(article=>article.readStatus==='unread').length;
case'read':return filteredByFolder.filter(article=>article.readStatus==='read').length;
case'readLater':return filteredByFolder.filter(article=>article.readLater).length;
default:return filteredByFolder.length
}
}

function renderArticleCard(article){
const readStatusLabel=article.readStatus==='read'?'未読':'既読',readLaterLabel=article.readLater?'解除':'後で読む',scoreDisplay=article.aiScore!==undefined?`🤖 ${article.aiScore}`:'';
return`<div class="article-card" data-read-status="${article.readStatus}"><div class="article-header"><h3 class="article-title"><a href="${article.url}" target="_blank" onclick="handleReadStatusToggle('${article.id}')">${article.title}</a></h3><div class="article-meta"><span class="date">${formatDate(article.publishDate)}</span><span class="source">${article.rssSource}</span><span class="category">${article.category}</span>${scoreDisplay?`<span class="ai-score">${scoreDisplay}</span>`:''}${article.userRating>0?`<span class="rating-badge">★${article.userRating}</span>`:''}</div></div><div class="article-content">${article.content}</div>${article.keywords?.length>0?`<div class="article-keywords">${article.keywords.map(keyword=>`<span class="keyword">${keyword}</span>`).join('')}</div>`:'}<div class="article-actions"><button class="simple-btn read-status" onclick="handleReadStatusToggle('${article.id}')">${readStatusLabel}</button><button class="simple-btn read-later ${article.readLater?'active':''}" onclick="handleReadLaterToggle('${article.id}')" data-active="${article.readLater}">${readLaterLabel}</button></div>${createStarRating(article.userRating,article.id)}</div>`
}

function renderModal(){
if(!state.showModal)return'';
const foldersHook=DataHooks.useFolders(),rssHook=DataHooks.useRSSManager(),wordHook=DataHooks.useWordFilters();
switch(state.showModal){
case'rss':
const rssItems=rssHook.rssFeeds.map(feed=>{
const folder=feed.folderId==='uncategorized'?{name:'未分類',color:'#6c757d'}:foldersHook.folders.find(f=>f.id===feed.folderId)||{name:'不明',color:'#6c757d'};
return`<div class="rss-item" style="border-left-color: ${folder.color}"><div class="rss-info"><div class="rss-editable-row"><strong onclick="handleRSSEdit('${feed.id}','title','${feed.title.replace(/'/g,'\\\'')}')">${feed.title}</strong></div><div class="rss-editable-row"><span class="rss-url" onclick="handleRSSEdit('${feed.id}','url','${feed.url}')">${feed.url}</span></div><div class="rss-editable-row" onclick="handleRSSEdit('${feed.id}','folder','${feed.folderId}')">フォルダ: ${folder.name}</div><span class="rss-updated">最終更新: ${formatDate(feed.lastUpdated)}</span><span class="rss-status ${feed.isActive?'active':'inactive'}">${feed.isActive?'有効':'無効'}</span></div><div class="rss-actions"><button class="action-btn danger" onclick="handleRSSRemove('${feed.id}')">削除</button></div></div>`
}).join('');
return`<div class="modal-overlay" onclick="handleModalClose()"><div class="modal" onclick="event.stopPropagation()"><div class="modal-header"><h2>RSS フィード管理</h2><button type="button" class="modal-close" onclick="handleModalClose()">&times;</button></div><div class="modal-body"><div class="modal-actions"><button class="action-btn success" onclick="handleRSSAdd()">新しいフィードを追加</button></div><div class="rss-list">${rssItems}</div><div class="rss-help"><h4>使い方</h4><ul><li>タイトル、URL、フォルダをクリックすると編集できます</li><li>新規追加時はフォルダを選択してからURLを入力してください</li><li>フィードのタイトルは自動取得されます</li></ul></div></div></div></div>`;
case'folders':
const folderItems=foldersHook.folders.map(folder=>`<div class="folder-item" style="border-left: 4px solid ${folder.color}"><div class="folder-info"><strong>${folder.name}</strong><span class="folder-color">${FolderManager.getColorName(folder.color)}</span><span class="folder-created">作成日: ${formatDate(folder.createdAt)}</span></div><div class="folder-actions"><button class="action-btn danger" onclick="handleFolderRemove('${folder.id}')">削除</button></div></div>`).join('');
return`<div class="modal-overlay" onclick="handleModalClose()"><div class="modal" onclick="event.stopPropagation()"><div class="modal-header"><h2>フォルダ管理</h2><button type="button" class="modal-close" onclick="handleModalClose()">&times;</button></div><div class="modal-body"><div class="modal-actions"><button class="action-btn success" onclick="handleFolderAdd()">新しいフォルダを作成</button></div><div class="folder-list">${folderItems}</div><div class="folder-help"><h4>フォルダ機能について</h4><p>フォルダを使ってRSSフィードを分類整理できます。記事もフォルダ別に表示できます。</p></div></div></div></div>`;
case'words':
const interestWords=wordHook.wordFilters.interestWords.map(word=>`<span class="word-tag interest">${word}<button class="word-remove" onclick="handleWordRemove('${word}','interest')">×</button></span>`).join(''),ngWords=wordHook.wordFilters.ngWords.map(word=>`<span class="word-tag ng">${word}<button class="word-remove" onclick="handleWordRemove('${word}','ng')">×</button></span>`).join('');
return`<div class="modal-overlay" onclick="handleModalClose()"><div class="modal" onclick="event.stopPropagation()"><div class="modal-header"><h2>ワード管理</h2><button type="button" class="modal-close" onclick="handleModalClose()">&times;</button></div><div class="modal-body"><div class="word-section"><div class="word-section-header"><h3>気になるワード</h3><button class="action-btn success" onclick="handleWordAdd('interest')">追加</button></div><div class="word-list">${interestWords||'<span class="text-muted">設定されていません</span>'}</div></div><div class="word-section"><div class="word-section-header"><h3>NGワード</h3><button class="action-btn danger" onclick="handleWordAdd('ng')">追加</button></div><div class="word-list">${ngWords||'<span class="text-muted">設定されていません</span>'}</div></div><div class="word-help"><h4>ワードフィルターについて</h4><p><strong>気になるワード:</strong> 含む記事のスコアが上がります</p><p><strong>NGワード:</strong> 含む記事は表示されません</p></div></div></div></div>`;
}
return''
}

function render(){
const root=document.getElementById('root');
if(!root)return;
const filteredArticles=getFilteredArticles(),articlesHtml=filteredArticles.length>0?filteredArticles.map(renderArticleCard).join(''):'<div class="empty-message">表示する記事がありません</div>';
root.innerHTML=`<div class="app">${renderNavigation()}<div class="main-content"><div class="article-grid">${articlesHtml}</div></div>${renderModal()}</div>`;
attachEventListeners()
}

function attachEventListeners(){
const starElements=document.querySelectorAll('.star');
starElements.forEach(star=>{star.addEventListener('click',handleStarClick)});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&state.showModal)handleModalClose()});
console.log('[App] Event listeners attached. Stars:',starElements.length)
}

document.addEventListener('DOMContentLoaded',()=>{initializeData();render()});

window.handleFilterChange=mode=>setState({viewMode:mode});
window.handleFolderChange=folderId=>setState({selectedFolder:folderId});
window.handleModalOpen=modalType=>setState({showModal:modalType});
window.handleModalClose=()=>setState({showModal:null});
window.handleRefresh=handleRefresh;
window.handleStarClick=handleStarClick;
window.handleReadStatusToggle=handleReadStatusToggle;
window.handleReadLaterToggle=handleReadLaterToggle;
window.handleRSSAdd=handleRSSAdd;
window.handleRSSEdit=handleRSSEdit;
window.handleRSSRemove=handleRSSRemove;
window.handleFolderAdd=handleFolderAdd;
window.handleFolderRemove=handleFolderRemove;
window.handleWordAdd=handleWordAdd;
window.handleWordRemove=handleWordRemove;
window.handleRSSMoveFolderChange=handleRSSMoveFolderChange;

})();
