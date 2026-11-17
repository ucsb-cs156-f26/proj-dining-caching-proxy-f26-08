package edu.ucsb.cs156.diningcachingproxy.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.assertArg;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponse;
import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponseRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

public class DiningProxyServiceTests {

  private static final String UPSTREAM_HOST = "https://api.ucsb.edu";

  private CachedResponseRepository cachedResponseRepository;
  private StatsService statsService;
  private RestTemplate restTemplate;
  private MockRestServiceServer mockServer;
  private DiningProxyService diningProxyService;

  @BeforeEach
  public void setup() {
    cachedResponseRepository = mock(CachedResponseRepository.class);
    statsService = mock(StatsService.class);
    restTemplate = new RestTemplate();
    mockServer = MockRestServiceServer.bindTo(restTemplate).build();
    diningProxyService =
        new DiningProxyService(cachedResponseRepository, statsService, restTemplate, UPSTREAM_HOST);
  }

  @Test
  public void cache_hit_returns_cached_response_and_increments_hit_count() {
    CachedResponse cached =
        CachedResponse.builder()
            .requestPath("/dining/commons/v1/")
            .responseStatus(200)
            .responseBody("[\"cached\"]")
            .hitCount(4)
            .build();
    when(cachedResponseRepository.findByRequestPath("/dining/commons/v1/"))
        .thenReturn(Optional.of(cached));

    ResponseEntity<String> response =
        diningProxyService.proxyGet("/dining/commons/v1/", "key123", "1.0");

    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertEquals("[\"cached\"]", response.getBody());
    verify(statsService, times(1)).recordHit();
    verify(statsService, times(0)).recordMiss();
    verify(cachedResponseRepository, times(1))
        .save(
            eq(
                CachedResponse.builder()
                    .requestPath("/dining/commons/v1/")
                    .responseStatus(200)
                    .responseBody("[\"cached\"]")
                    .hitCount(5)
                    .build()));
    mockServer.verify();
  }

  @Test
  public void cache_miss_forwards_to_upstream_with_headers_and_caches_2xx_response() {
    when(cachedResponseRepository.findByRequestPath("/dining/commons/v1/"))
        .thenReturn(Optional.empty());

    mockServer
        .expect(requestTo(UPSTREAM_HOST + "/dining/commons/v1/"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header("ucsb-api-key", "key123"))
        .andExpect(header("ucsb-api-version", "1.0"))
        .andRespond(withSuccess("[\"fresh\"]", MediaType.APPLICATION_JSON));

    ResponseEntity<String> response =
        diningProxyService.proxyGet("/dining/commons/v1/", "key123", "1.0");

    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertEquals("[\"fresh\"]", response.getBody());
    verify(statsService, times(1)).recordMiss();
    verify(statsService, times(0)).recordHit();
    verify(cachedResponseRepository, times(1))
        .save(
            assertArg(
                cachedResponse -> {
                  assertEquals("/dining/commons/v1/", cachedResponse.getRequestPath());
                  assertEquals(200, cachedResponse.getResponseStatus());
                  assertEquals("[\"fresh\"]", cachedResponse.getResponseBody());
                  assertEquals(1, cachedResponse.getHitCount());
                  assertNotNull(cachedResponse.getCachedAt());
                }));
    mockServer.verify();
  }

  @Test
  public void cache_miss_omits_headers_the_caller_did_not_send() {
    when(cachedResponseRepository.findByRequestPath("/dining/commons/v1/"))
        .thenReturn(Optional.empty());

    mockServer
        .expect(requestTo(UPSTREAM_HOST + "/dining/commons/v1/"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

    diningProxyService.proxyGet("/dining/commons/v1/", null, null);

    mockServer.verify();
  }

  @Test
  public void error_response_is_passed_through_and_not_cached() {
    when(cachedResponseRepository.findByRequestPath(any())).thenReturn(Optional.empty());

    mockServer
        .expect(requestTo(UPSTREAM_HOST + "/dining/menu/v1/2024-08-16/carrillo"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withStatus(HttpStatus.NOT_FOUND).body("not found"));

    ResponseEntity<String> response =
        diningProxyService.proxyGet("/dining/menu/v1/2024-08-16/carrillo", "key123", null);

    assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    assertEquals("not found", response.getBody());
    verify(cachedResponseRepository, times(0)).save(any());
    mockServer.verify();
  }

  @Test
  public void server_error_response_is_passed_through_and_not_cached() {
    when(cachedResponseRepository.findByRequestPath(any())).thenReturn(Optional.empty());

    mockServer
        .expect(requestTo(UPSTREAM_HOST + "/dining/commons/v1/"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("boom"));

    ResponseEntity<String> response =
        diningProxyService.proxyGet("/dining/commons/v1/", null, null);

    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
    assertEquals("boom", response.getBody());
    verify(cachedResponseRepository, times(0)).save(any());
    mockServer.verify();
  }

  @Test
  public void a_non_2xx_response_that_does_not_throw_is_passed_through_and_not_cached() {
    when(cachedResponseRepository.findByRequestPath(any())).thenReturn(Optional.empty());

    mockServer
        .expect(requestTo(UPSTREAM_HOST + "/dining/commons/v1/"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withStatus(HttpStatus.NOT_MODIFIED));

    ResponseEntity<String> response =
        diningProxyService.proxyGet("/dining/commons/v1/", null, null);

    assertEquals(HttpStatus.NOT_MODIFIED, response.getStatusCode());
    verify(cachedResponseRepository, times(0)).save(any());
    mockServer.verify();
  }
}
