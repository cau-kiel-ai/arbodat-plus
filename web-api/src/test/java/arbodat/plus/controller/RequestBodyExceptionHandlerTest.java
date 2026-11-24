package arbodat.plus.controller;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A value of the wrong type is refused with its field, so the migration can show it at the row. */
@AutoConfigureMockMvc
class RequestBodyExceptionHandlerTest extends PostgresTest {

    @Autowired MockMvc mvc;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void aValueWhichIsNotANumberIsRefusedWithItsField() throws Exception {
        mvc.perform(post("/coordinates/site/" + data.site1()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"longitude\":1,\"latitude\":2,\"altitude\":\"12,5a\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string("altitude: '12,5a' is not a number"));
    }

    @Test
    void anUnreadableBodyIsRefusedWithAGeneralMessage() throws Exception {
        mvc.perform(post("/coordinates/site/" + data.site1()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"longitude\":"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string("The request could not be read."));
    }
}
