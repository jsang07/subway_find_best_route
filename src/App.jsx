import { useState, useEffect, useRef } from 'react';
import './App.css';
import { findShortestPath } from './dijkstra';

// 공식 호선별 색상
const LINE_COLORS = {
  '1': '#0052A4', '2': '#00A84D', '3': '#EF7C1C', '4': '#00A5DE',
  '5': '#996CAC', '6': '#CD7C2F', '7': '#747F00', '8': '#E6186C', '9': '#BDB092'
};

const timeToSeconds = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}초`;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
};

export default function App() {
  const [graph, setGraph] = useState(null);
  const [stationLines, setStationLines] = useState({});
  const [stationCoords, setStationCoords] = useState({});
  
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [result, setResult] = useState(null);
  
  const [isPathExpanded, setIsPathExpanded] = useState(false);

  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const polylinesRef = useRef([]); 
  const infoWindowRef = useRef(null);

  // 전역 함수 등록
  useEffect(() => {
    window.__setStartStation = (station) => {
      setStart(station);
      if (infoWindowRef.current) infoWindowRef.current.close();
    };
    window.__setEndStation = (station) => {
      setEnd(station);
      if (infoWindowRef.current) infoWindowRef.current.close();
    };
    
    return () => {
      delete window.__setStartStation;
      delete window.__setEndStation;
    };
  }, []);

  // 1. CSV 데이터 파싱
  useEffect(() => {
    Promise.all([
      fetch(import.meta.env.BASE_URL + 'subway.csv').then(res => res.arrayBuffer()),
      fetch(import.meta.env.BASE_URL + 'station_coords.csv').then(res => res.arrayBuffer())
    ]).then(([buffer1, buffer2]) => {
      
      const text1 = new TextDecoder('euc-kr').decode(buffer1);
      const lines1 = text1.split('\n').filter(line => line.trim() !== '');
      const newGraph = {};
      const linesMap = {};

      for (let i = 1; i < lines1.length - 1; i++) {
        const curr = lines1[i].split(',');
        const next = lines1[i + 1].split(',');
        
        const currLine = curr[1];
        const stA = curr[2].trim();
        if (!linesMap[stA]) linesMap[stA] = new Set();
        linesMap[stA].add(currLine);

        if (curr[1] === next[1]) {
          const stB = next[2].trim();
          let timeSec = next[3] ? timeToSeconds(next[3]) : 0;
          const distKm = parseFloat(next[4]);

          if (distKm > 0 && timeSec > 0) {
            if (!newGraph[stA]) newGraph[stA] = {};
            if (!newGraph[stB]) newGraph[stB] = {};
            newGraph[stA][stB] = { dist: distKm, time: timeSec };
            newGraph[stB][stA] = { dist: distKm, time: timeSec };
          }
        }
      }
      
      if (newGraph['성수'] && newGraph['용답']) {
        newGraph['성수']['용답'] = { dist: 2.3, time: 180 };
        newGraph['용답']['성수'] = { dist: 2.3, time: 180 };
      }
      setGraph(newGraph);
      setStationLines(linesMap);

      const text2 = new TextDecoder('euc-kr').decode(buffer2); 
      const lines2 = text2.split('\n').filter(line => line.trim() !== '');
      const newCoords = {};
      
      const headers = lines2[0].split(',');
      const nameIdx = headers.findIndex(h => h.includes('역사명') || h.includes('역명'));
      const latIdx = headers.findIndex(h => h.includes('위도'));
      const lngIdx = headers.findIndex(h => h.includes('경도'));

      for (let i = 1; i < lines2.length; i++) {
        const cols = lines2[i].split(',');
        if (cols.length > lngIdx) {
          let stName = cols[nameIdx].replace(/"/g, '').split('(')[0].trim();
          let lat = parseFloat(cols[latIdx].replace(/"/g, ''));
          let lng = parseFloat(cols[lngIdx].replace(/"/g, ''));
          
          if (!isNaN(lat) && !isNaN(lng)) {
            newCoords[stName] = { lat, lng };
          }
        }
      }
      setStationCoords(newCoords);

    }).catch(err => console.error('데이터 로드 에러:', err));
  }, []);

  // 2. 지도 생성 및 마커/InfoWindow 등록
  useEffect(() => {
    if (Object.keys(stationCoords).length === 0 || !graph) return;
    if (!window.naver || !window.naver.maps) return;
    if (mapInstance.current) return;

    const map = new window.naver.maps.Map(mapElement.current, {
      center: new window.naver.maps.LatLng(37.5665, 126.9780),
      zoom: 13
    });
    mapInstance.current = map;

    infoWindowRef.current = new window.naver.maps.InfoWindow({
      content: '',
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      anchorSize: new window.naver.maps.Size(12, 12),
      pixelOffset: new window.naver.maps.Point(0, -10),
      boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
    });

    Object.keys(stationCoords).forEach(stationName => {
      if (!graph[stationName]) return; 

      const pos = new window.naver.maps.LatLng(stationCoords[stationName].lat, stationCoords[stationName].lng);
      const marker = new window.naver.maps.Marker({
        position: pos,
        map: map,
        icon: {
          content: `<div style="background:white; border:2px solid #64748b; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); cursor:pointer; white-space:nowrap; color:#334155;">${stationName}</div>`,
          anchor: new window.naver.maps.Point(15, 15)
        }
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        const infoHtml = `
          <div style="padding: 18px; text-align: center; min-width: 170px; font-family: 'Pretendard', sans-serif;">
            <h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 18px; letter-spacing: -0.5px;">${stationName}역</h3>
            <div style="display: flex; gap: 8px; justify-content: center;">
              <button onclick="window.__setStartStation('${stationName}')" style="flex:1; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s;">출발</button>
              <button onclick="window.__setEndStation('${stationName}')" style="flex:1; padding: 10px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s;">도착</button>
            </div>
          </div>
        `;
        infoWindowRef.current.setContent(infoHtml);
        infoWindowRef.current.open(map, marker);
      });

      window.naver.maps.Event.addListener(map, 'click', () => {
        if (infoWindowRef.current) infoWindowRef.current.close();
      });

      markersRef.current[stationName] = marker;
    });
  }, [stationCoords, graph]);

  // 3. 출발/도착역 세팅 시 최단경로 실행
  useEffect(() => {
    if (start && end && graph && graph[start] && graph[end]) {
      const { path, distance, time } = findShortestPath(graph, start, end);
      setResult({ path, distance, time });
      setIsPathExpanded(false);
    } else {
      setResult(null);
    }
  }, [start, end, graph]);

  // 4. 지도 마커 스타일, 가시성(Visible) 제어 및 선 그리기
  useEffect(() => {
    if (!mapInstance.current || Object.keys(markersRef.current).length === 0) return;

    Object.keys(markersRef.current).forEach(stationName => {
      const marker = markersRef.current[stationName];
      const isStart = stationName === start;
      const isEnd = stationName === end;
      
      const borderColor = isStart ? '#3b82f6' : isEnd ? '#ef4444' : '#64748b';
      const bgColor = (isStart || isEnd) ? '#fff8f8' : 'white';
      const scale = (isStart || isEnd) ? 'scale(1.2)' : 'scale(1)';
      const zIndex = (isStart || isEnd) ? 100 : 1;
      
      marker.setIcon({
        content: `<div style="background:${bgColor}; border:2px solid ${borderColor}; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transform:${scale}; transition:all 0.2s; cursor:pointer; white-space:nowrap; color:${isStart || isEnd ? borderColor : '#334155'}">${stationName}</div>`,
        anchor: new window.naver.maps.Point(15, 15)
      });
      marker.setZIndex(zIndex);

      // 💡 경로에 포함된 역만 보여주고 나머지는 숨김
      if (result && result.path.length > 0) {
        if (result.path.includes(stationName)) {
          marker.setVisible(true);
        } else {
          marker.setVisible(false);
        }
      } else {
        marker.setVisible(true);
      }
    });

    polylinesRef.current.forEach(pl => pl.setMap(null));
    polylinesRef.current = [];

    if (result && result.path.length > 0) {
      const bounds = new window.naver.maps.LatLngBounds();

      for (let i = 0; i < result.path.length - 1; i++) {
        let st1 = result.path[i];
        let st2 = result.path[i+1];
        if (!stationCoords[st1] || !stationCoords[st2]) continue;

        let badges1 = Array.from(stationLines[st1] || []);
        let badges2 = Array.from(stationLines[st2] || []);
        let commonLine = badges1.find(l => badges2.includes(l)) || badges1[0];
        let segmentColor = LINE_COLORS[commonLine] || '#3b82f6';

        let p1 = new window.naver.maps.LatLng(stationCoords[st1].lat, stationCoords[st1].lng);
        let p2 = new window.naver.maps.LatLng(stationCoords[st2].lat, stationCoords[st2].lng);
        bounds.extend(p1);
        bounds.extend(p2);

        let pl = new window.naver.maps.Polyline({
          path: [p1, p2],
          strokeColor: segmentColor,
          strokeWeight: 7,
          strokeOpacity: 0.9,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          map: mapInstance.current
        });
        polylinesRef.current.push(pl);
      }
      
      // 💡 멍청하게 다시 넣었던 Margin 에러 확실하게 삭제
      mapInstance.current.fitBounds(bounds); 
    }
  }, [start, end, result, stationCoords]);

  // 타고 있는 호선과 환승 여부를 디테일하게 계산하는 헬퍼 함수
  const getRouteDetails = () => {
    if (!result || result.path.length === 0) return [];
    
    const details = [];
    let currentLine = null;

    for (let i = 0; i < result.path.length; i++) {
      const st = result.path[i];
      let nextSt = result.path[i+1];
      let prevSt = result.path[i-1];
      
      let takingLine = null;
      let isTransfer = false;

      if (nextSt) {
        let stBadges = Array.from(stationLines[st] || []);
        let nextBadges = Array.from(stationLines[nextSt] || []);
        takingLine = stBadges.find(l => nextBadges.includes(l)) || stBadges[0];
      }

      if (i > 0 && nextSt) {
        let prevBadges = Array.from(stationLines[prevSt] || []);
        let stBadges = Array.from(stationLines[st] || []);
        let lineFromPrev = prevBadges.find(l => stBadges.includes(l)) || prevBadges[0];
        
        if (lineFromPrev !== takingLine) {
          isTransfer = true;
          currentLine = takingLine;
        }
      } else if (i === 0) {
        currentLine = takingLine;
      }

      details.push({
        name: st,
        takingLine: currentLine,
        isTransfer: isTransfer
      });
    }
    return details;
  };

  const routeDetails = getRouteDetails();
  const validStations = Object.keys(stationCoords).filter(st => graph && graph[st]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, margin: 0, padding: 0, overflow: 'hidden', fontFamily: "'Pretendard', sans-serif" }}>
      
      <div ref={mapElement} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}></div>

      <div style={{ 
        position: 'absolute', top: '20px', left: '20px', width: '400px', maxHeight: 'calc(100vh - 40px)', 
        backgroundColor: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(12px)',
        zIndex: 10, borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', 
        display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.5)'
      }}>
        
        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <h2 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' }}>🚇 지하철 길찾기</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '14px 16px', background: 'rgba(241, 245, 249, 0.8)', borderRadius: '12px', display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0' }}>
              <span style={{ color: '#3b82f6', marginRight: '12px', fontSize: '12px' }}>●</span>
              <input 
                type="text" 
                placeholder="지도 클릭 또는 출발역 검색"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                list="station-list"
                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#0f172a', fontWeight: 'bold', fontSize: '15px', width: '100%' }}
              />
            </div>
            <div style={{ padding: '14px 16px', background: 'rgba(241, 245, 249, 0.8)', borderRadius: '12px', display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0' }}>
              <span style={{ color: '#ef4444', marginRight: '12px', fontSize: '12px' }}>●</span>
              <input 
                type="text" 
                placeholder="지도 클릭 또는 도착역 검색"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                list="station-list"
                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#0f172a', fontWeight: 'bold', fontSize: '15px', width: '100%' }}
              />
            </div>
            
            <datalist id="station-list">
              {validStations.map(st => (
                <option key={st} value={st} />
              ))}
            </datalist>

            {(start || end) && (
              <button 
                onClick={() => { setStart(''); setEnd(''); setResult(null); if (infoWindowRef.current) infoWindowRef.current.close(); }}
                style={{ alignSelf: 'flex-end', marginTop: '8px', padding: '8px 16px', cursor: 'pointer', border: 'none', borderRadius: '8px', background: '#e2e8f0', color: '#475569', fontSize: '13px', fontWeight: 'bold', transition: '0.2s' }}
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {result && routeDetails.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            
            <div style={{ paddingBottom: '20px', marginBottom: '20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <h3 style={{ marginTop: 0, color: '#0f172a', marginBottom: '12px', fontSize: '18px' }}>최적 경로 안내</h3>
              
              <div style={{ fontSize: '32px', fontWeight: '900', color: '#3b82f6', marginBottom: '12px', letterSpacing: '-1px' }}>
                {formatTime(result.time)} 
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '15px', color: '#475569', fontWeight: '600' }}>
                  총 이동 거리: <span style={{ color: '#0f172a' }}>{(result.distance).toFixed(1)} km</span>
                </span>
                <span style={{ fontSize: '15px', color: '#475569', fontWeight: '600' }}>
                  경유하는 역: <span style={{ color: '#0f172a' }}>{result.path.length - 1}개 역</span>
                </span>
              </div>
            </div>
            
            <div style={{ position: 'relative' }}>

              {/* 출발역 */}
              <div style={{ display: 'flex', marginBottom: '12px' }}>
                <div style={{ width: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '16px' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `4px solid ${LINE_COLORS[routeDetails[0].takingLine] || '#333'}`, backgroundColor: 'white', zIndex: 2 }}></div>
                  <div style={{ width: '3px', height: '100%', backgroundColor: LINE_COLORS[routeDetails[0].takingLine] || '#333', marginTop: '2px' }}></div>
                </div>
                <div style={{ flex: 1, paddingBottom: '20px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{routeDetails[0].name} <span style={{fontSize:'13px', color:'#94a3b8', fontWeight:'500'}}>승차</span></div>
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ background: LINE_COLORS[routeDetails[0].takingLine], color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>{routeDetails[0].takingLine}호선 탑승</span>
                  </div>
                </div>
              </div>

              {/* 중간 경유역 아코디언 */}
              {routeDetails.length > 2 && (
                <div style={{ display: 'flex', marginBottom: '12px' }}>
                  <div style={{ width: '24px', display: 'flex', justifyContent: 'center', marginRight: '16px' }}>
                    <div style={{ width: '3px', height: '100%', backgroundColor: '#e2e8f0' }}></div>
                  </div>
                  <div style={{ flex: 1, paddingBottom: '20px' }}>
                    <button 
                      onClick={() => setIsPathExpanded(!isPathExpanded)}
                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '600', transition: '0.2s' }}
                    >
                      {routeDetails.length - 2}개 역 이동 {isPathExpanded ? '▲' : '▼'}
                    </button>
                    
                    {isPathExpanded && (
                      <div style={{ marginTop: '16px', paddingLeft: '12px', borderLeft: '2px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {routeDetails.slice(1, -1).map((detail, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                            
                            {/* 💡 환승역일 경우 뱃지를 역 이름 '위'로 먼저 띄웁니다! */}
                            {detail.isTransfer && (
                              <div style={{ marginBottom: '6px', display: 'inline-block' }}>
                                <span style={{ background: '#fff', border: `1px solid ${LINE_COLORS[detail.takingLine]}`, color: LINE_COLORS[detail.takingLine], padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>
                                  🔄 {detail.takingLine}호선으로 환승
                                </span>
                              </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '15px', color: detail.isTransfer ? '#0f172a' : '#475569', fontWeight: detail.isTransfer ? '800' : '600', minWidth: '60px' }}>
                                {detail.name}
                              </span>
                              {/* 💡 사용자가 원했던 직관적인 "현재 타고 있는 호선의 색상 뱃지" */}
                              <span style={{ background: LINE_COLORS[detail.takingLine], color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                {detail.takingLine}호선
                              </span>
                            </div>
                            
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 도착역 */}
              <div style={{ display: 'flex' }}>
                <div style={{ width: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '16px' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `4px solid ${LINE_COLORS[routeDetails[routeDetails.length-1].takingLine] || '#333'}`, backgroundColor: 'white', zIndex: 2 }}></div>
                </div>
                <div style={{ flex: 1, paddingBottom: '24px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{routeDetails[routeDetails.length-1].name} <span style={{fontSize:'13px', color:'#94a3b8', fontWeight:'500'}}>하차</span></div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}