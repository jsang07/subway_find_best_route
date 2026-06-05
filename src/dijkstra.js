// src/dijkstra.js
export function findShortestPath(graph, startNode, endNode) {
  let times = {};
  let distances = {};
  let backtrace = {};
  let pq = []; // 우선순위 큐

  // 초기화
  for (let node in graph) {
    times[node] = Infinity;
    distances[node] = 0;
  }
  times[startNode] = 0;
  pq.push({ node: startNode, time: 0, dist: 0 });

  while (pq.length > 0) {
    // 시간이 가장 적게 걸리는 경로를 우선적으로 탐색 (최소 시간 기준 정렬)
    pq.sort((a, b) => a.time - b.time);
    let current = pq.shift();
    let currentNode = current.node;

    if (currentNode === endNode) break;

    for (let neighbor in graph[currentNode]) {
      let edge = graph[currentNode][neighbor];
      let newTime = times[currentNode] + edge.time;
      let newDist = distances[currentNode] + edge.dist;

      // 더 빠른 시간의 경로를 찾았을 경우 갱신
      if (newTime < times[neighbor]) {
        times[neighbor] = newTime;
        distances[neighbor] = newDist;
        backtrace[neighbor] = currentNode;
        pq.push({ node: neighbor, time: newTime, dist: newDist });
      }
    }
  }

  let path = [endNode];
  let lastStep = endNode;
  while (lastStep !== startNode) {
    path.unshift(backtrace[lastStep]);
    lastStep = backtrace[lastStep];
    
    // 경로가 끊긴 경우
    if (!lastStep) return { path: [], distance: 0, time: 0 }; 
  }

  return { 
    path, 
    distance: distances[endNode], 
    time: times[endNode] 
  };
}