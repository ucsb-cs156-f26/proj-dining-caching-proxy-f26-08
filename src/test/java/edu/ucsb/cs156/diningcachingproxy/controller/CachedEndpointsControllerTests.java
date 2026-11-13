package edu.ucsb.cs156.diningcachingproxy.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import edu.ucsb.cs156.diningcachingproxy.ControllerTestCase;
import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponse;
import edu.ucsb.cs156.diningcachingproxy.collections.CachedResponseRepository;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;

@WebMvcTest(controllers = CachedEndpointsController.class)
public class CachedEndpointsControllerTests extends ControllerTestCase {

  @MockitoBean CachedResponseRepository cachedResponseRepository;

  @Test
  public void logged_out_users_cannot_get_endpoints() throws Exception {
    mockMvc.perform(get("/api/admin/endpoints")).andExpect(status().is(403));
  }

  @WithMockUser(roles = {"USER"})
  @Test
  public void logged_in_regular_users_cannot_get_endpoints() throws Exception {
    mockMvc.perform(get("/api/admin/endpoints")).andExpect(status().is(403));
  }

  @WithMockUser(roles = {"ADMIN"})
  @Test
  public void admin_can_list_cached_endpoints_with_hit_counts() throws Exception {
    CachedResponse commons =
        CachedResponse.builder()
            .id("cache-1")
            .requestPath("/dining/commons/v1/")
            .responseStatus(200)
            .responseBody("[]")
            .hitCount(5)
            .build();

    CachedResponse menu =
        CachedResponse.builder()
            .id("cache-2")
            .requestPath("/dining/menu/v1/2024-08-16/carrillo")
            .responseStatus(200)
            .responseBody("{}")
            .hitCount(1)
            .build();

    when(cachedResponseRepository.findAll()).thenReturn(Arrays.asList(commons, menu));

    MvcResult response =
        mockMvc.perform(get("/api/admin/endpoints")).andExpect(status().isOk()).andReturn();

    List<CachedEndpointsController.CachedEndpointDTO> expected =
        List.of(
            new CachedEndpointsController.CachedEndpointDTO(
                "cache-1", "/dining/commons/v1/", 5, 200, "[]"),
            new CachedEndpointsController.CachedEndpointDTO(
                "cache-2", "/dining/menu/v1/2024-08-16/carrillo", 1, 200, "{}"));

    String expectedJson = mapper.writeValueAsString(expected);
    assertEquals(expectedJson, response.getResponse().getContentAsString());
  }

  @Test
  public void logged_out_users_cannot_delete_endpoints() throws Exception {
    mockMvc.perform(delete("/api/admin/endpoints/cache-1")).andExpect(status().is(403));
  }

  @WithMockUser(roles = {"USER"})
  @Test
  public void regular_users_cannot_delete_endpoints() throws Exception {
    mockMvc.perform(delete("/api/admin/endpoints/cache-1")).andExpect(status().is(403));
  }

  @WithMockUser(roles = {"ADMIN"})
  @Test
  public void admin_can_delete_cached_endpoint() throws Exception {
    when(cachedResponseRepository.existsById("cache-1")).thenReturn(true);

    mockMvc.perform(delete("/api/admin/endpoints/cache-1")).andExpect(status().isNoContent());

    verify(cachedResponseRepository).deleteById("cache-1");
  }

  @WithMockUser(roles = {"ADMIN"})
  @Test
  public void deleting_nonexistent_endpoint_returns_404() throws Exception {
    when(cachedResponseRepository.existsById("missing-id")).thenReturn(false);

    mockMvc.perform(delete("/api/admin/endpoints/missing-id")).andExpect(status().isNotFound());
  }
}
