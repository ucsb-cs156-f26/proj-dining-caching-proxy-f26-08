package edu.ucsb.cs156.diningcachingproxy.services;

import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponse;
import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponseRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Shared cache-check/forward/store logic used by every proxy controller. A cache miss is forwarded
 * upstream with whatever {@code ucsb-api-key}/{@code ucsb-api-version} headers the caller sent;
 * only a successful (2xx) upstream response gets cached. This is a byte-for-byte mirror of what the
 * upstream UCSB API would have returned — no dining-specific business logic (e.g. proj-dining's own
 * empty-response-to-204 conversion) belongs here.
 */
@Service
public class DiningProxyService {

  private final CachedResponseRepository cachedResponseRepository;
  private final StatsService statsService;
  private final RestTemplate restTemplate;
  private final String upstreamHost;

  public DiningProxyService(
      CachedResponseRepository cachedResponseRepository,
      StatsService statsService,
      RestTemplate restTemplate,
      @Value("${app.upstream.host}") String upstreamHost) {
    this.cachedResponseRepository = cachedResponseRepository;
    this.statsService = statsService;
    this.restTemplate = restTemplate;
    this.upstreamHost = upstreamHost;
  }

  public ResponseEntity<String> proxyGet(String requestPath, String apiKey, String apiVersion) {
    Optional<CachedResponse> cached = cachedResponseRepository.findByRequestPath(requestPath);
    if (cached.isPresent()) {
      statsService.recordHit();
      CachedResponse c = cached.get();
      c.setHitCount(c.getHitCount() + 1);
      cachedResponseRepository.save(c);
      return ResponseEntity.status(c.getResponseStatus())
          .contentType(MediaType.APPLICATION_JSON)
          .body(c.getResponseBody());
    }

    statsService.recordMiss();

    HttpHeaders headers = new HttpHeaders();
    headers.setAccept(List.of(MediaType.APPLICATION_JSON));
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (apiKey != null) {
      headers.set("ucsb-api-key", apiKey);
    }
    if (apiVersion != null) {
      headers.set("ucsb-api-version", apiVersion);
    }

    ResponseEntity<String> upstreamResponse;
    try {
      upstreamResponse =
          restTemplate.exchange(
              upstreamHost + requestPath, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    } catch (HttpClientErrorException | HttpServerErrorException e) {
      return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString());
    }

    if (upstreamResponse.getStatusCode().is2xxSuccessful()) {
      cachedResponseRepository.save(
          CachedResponse.builder()
              .requestPath(requestPath)
              .responseStatus(upstreamResponse.getStatusCode().value())
              .responseBody(upstreamResponse.getBody())
              .cachedAt(Instant.now())
              .hitCount(1)
              .build());
    }

    return upstreamResponse;
  }
}
