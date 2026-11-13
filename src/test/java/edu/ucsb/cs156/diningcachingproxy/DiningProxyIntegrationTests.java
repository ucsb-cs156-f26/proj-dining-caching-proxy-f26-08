package edu.ucsb.cs156.diningcachingproxy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponseRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestTemplate;

/**
 * End-to-end verification of the caching flow against a real (embedded) MongoDB: a cache miss is
 * forwarded upstream and saved, a second identical request is served from the cache with no second
 * upstream call, the stats counters reflect both, and the cached endpoint's hit count and
 * appearance in the admin endpoint-inventory view are correct.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("integration")
public class DiningProxyIntegrationTests {

  @Autowired private MockMvc mockMvc;
  @Autowired private RestTemplate restTemplate;
  @Autowired private CachedResponseRepository cachedResponseRepository;

  @Test
  @WithMockUser(roles = "ADMIN")
  public void a_cache_miss_is_stored_and_a_repeat_request_is_served_from_the_cache()
      throws Exception {
    cachedResponseRepository.deleteAll();

    MockRestServiceServer mockServer = MockRestServiceServer.bindTo(restTemplate).build();
    mockServer
        .expect(requestTo("https://api.ucsb.edu/dining/commons/v1/"))
        .andRespond(withSuccess("[\"DLG\"]", MediaType.APPLICATION_JSON));

    // First request: cache miss, forwarded upstream, then cached.
    mockMvc
        .perform(get("/dining/commons/v1/").header("ucsb-api-key", "key123"))
        .andExpect(status().isOk())
        .andExpect(content().string("[\"DLG\"]"));

    mockServer.verify();
    assertTrue(cachedResponseRepository.findByRequestPath("/dining/commons/v1/").isPresent());

    // Second request: no new upstream expectation was registered above, so if this ever
    // hit the upstream again MockRestServiceServer would fail the test.
    mockMvc
        .perform(get("/dining/commons/v1/").header("ucsb-api-key", "key123"))
        .andExpect(status().isOk())
        .andExpect(content().string("[\"DLG\"]"));

    String statsJson =
        mockMvc
            .perform(get("/api/stats"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertEquals(
        "{\"totalRequests\":2,\"cacheHits\":1,\"cacheMisses\":1,\"hitRatePercentage\":50.0}",
        statsJson);

    mockMvc
        .perform(get("/api/admin/endpoints"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].requestPath").value("/dining/commons/v1/"))
        .andExpect(jsonPath("$[0].cachedAt").isNotEmpty())
        .andExpect(jsonPath("$[0].hitCount").value(2));
  }
}
